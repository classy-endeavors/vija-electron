# Milestone 3 Chrome Extension Architecture

Purpose: define a practical architecture for a Chrome extension that sends browser context into the Vijia Electron app for Milestone 3.

## Recommendation

Use a `Chrome Manifest V3 extension` plus a `local loopback bridge` inside Electron.

Recommended transport:

- Chrome extension `content script` extracts browser context from supported AI sites
- Extension `service worker` normalizes and forwards payloads
- Electron main process runs a tiny local HTTP server on `127.0.0.1`
- Extension sends `POST` requests to that local bridge
- Electron validates, deduplicates, logs, stores the note, then emits internal `vijia:` events

This is the best M3 fit because it is:

- simpler than Chrome Native Messaging
- easier to debug than a custom socket protocol
- compatible with the current Electron app without adding a separate companion process
- aligned with the PRD goal of getting clean text directly from browser AI tabs

## Why This Instead Of Native Messaging

Native Messaging is more locked down, but it adds install-time complexity:

- host manifest registration on Windows
- per-browser registration steps
- harder local development and QA

For Milestone 3, loopback HTTP is enough if we keep it local-only and require a session token.

## High-Level Shape

```text
Chrome Tab
  -> content script reads last user/assistant pair
  -> service worker validates + forwards
  -> POST http://127.0.0.1:<port>/extension/capture
  -> Electron bridge receives payload
  -> text-extraction/session-log/proactive-engine pipeline
  -> NotificationManager decides whether to speak
```

## Responsibilities

### Chrome Extension

The extension should only do browser-side work:

- detect supported pages
- observe DOM changes
- wait for stable AI output
- extract the last user/assistant message pair
- collect tab metadata
- send a minimal payload to the app

The extension should not:

- call Gemini or Claude directly
- persist sensitive chat data long-term
- own notification logic
- decide whether Vijia should speak

### Electron App

The app remains the source of truth for product behavior:

- authenticate/authorize the extension bridge
- deduplicate capture events
- redact secrets again on the desktop side
- write `session-log.jsonl`
- call `gemini-proxy`
- trigger the proactive engine
- route any UI updates through existing overlay and IPC systems

## Proposed Components

## 1. Chrome Extension

### `manifest.json`

Key pieces:

- `manifest_version: 3`
- permissions: `storage`, `tabs`
- host permissions for:
  - `https://chatgpt.com/*`
  - `https://chat.openai.com/*`
  - `https://claude.ai/*`
  - `https://gemini.google.com/*`
  - `https://www.perplexity.ai/*`
  - `https://chat.deepseek.com/*`
  - `http://127.0.0.1/*`
- background `service_worker`
- content scripts per supported domain

### `content-script`

One shared extractor with site adapters:

- `detectSiteFromLocation()`
- `waitForStableContent()`
- `extractLastPair()`
- `collectTabMetadata()`

Triggers:

- DOM mutations in the conversation container
- debounced input/submit events
- tab visibility changes
- manual retry message from service worker if needed

Output:

- send structured extraction to service worker via `chrome.runtime.sendMessage`

### `service-worker`

Responsibilities:

- receives extraction messages from content scripts
- adds extension/session metadata
- deduplicates noisy bursts at the browser layer
- forwards payload to Electron loopback API
- tracks bridge health
- optionally exposes a browser action badge like `connected` / `offline`

## 2. Electron Main Process

### `browser-bridge.ts`

New main-process module responsible for:

- creating a local HTTP server using Node `http`
- binding to `127.0.0.1` only
- exposing a small set of endpoints
- validating token, origin, schema, and payload size
- forwarding valid requests into the app pipeline

Recommended endpoints:

- `POST /extension/handshake`
- `POST /extension/capture`
- `GET /extension/health`

### `text-extraction.ts`

This file should become the shared normalization layer for both sources:

- `source = browser-extension`
- `source = screenshot`

For extension-fed captures, the app should skip browser `executeJavaScript` entirely and reuse:

- secret scrubbing
- truncation rules
- note schema generation

### `session-log.ts`

No major change in ownership:

- still appends one normalized note per accepted capture
- still remains the durable source for M3/M4/M5

### `proactive-engine.ts`

No browser-specific logic should live here.

It should continue to react to `note-appended` events regardless of whether the note came from:

- browser extension extraction
- screenshot fallback

## End-To-End Flow

## Supported AI Tab

1. User types or reads on ChatGPT, Claude, Gemini, Perplexity, or DeepSeek.
2. Content script observes the page and waits for the final assistant output to stabilize.
3. Content script extracts the latest user/assistant pair.
4. Service worker sends the payload to Electron `POST /extension/capture`.
5. Electron validates token and schema.
6. Electron runs desktop-side scrub + truncation + dedupe.
7. Electron sends the normalized text to `gemini-proxy`.
8. Electron writes the note to `data/session-log.jsonl`.
9. Electron emits internal note-appended event.
10. Proactive engine decides whether to notify.

## Unsupported Site Or Extension Missing

Fallback stays in the Electron app:

1. Existing desktop capture trigger fires.
2. App uses screenshot flow.
3. Remaining pipeline stays the same.

This gives us graceful degradation instead of making the extension a hard dependency for all capture.

## Suggested Payload Contract

Extension to Electron:

```json
{
  "schema": 1,
  "sessionToken": "opaque-random-token",
  "eventId": "evt_01...",
  "capturedAt": "2026-04-20T12:00:00.000Z",
  "site": "chatgpt",
  "url": "https://chatgpt.com/c/abc",
  "title": "ChatGPT - GPT-5",
  "tabId": 123,
  "frameId": 0,
  "source": "browser-extension",
  "extract": {
    "user": "latest user message",
    "assistant": "latest assistant message"
  },
  "pageState": {
    "streamStable": true,
    "visibility": "visible"
  }
}
```

Notes:

- `eventId` supports dedupe on the Electron side
- `sessionToken` is issued by the app during handshake
- `url` is useful for debugging, but should not be persisted in raw form if product/privacy rules say otherwise

## Handshake And Trust Model

Minimum security for M3:

1. Electron generates a random session token at startup.
2. User copies or the app exposes that token to the extension setup screen.
3. Extension calls `POST /extension/handshake` with the token.
4. Electron stores a short-lived trusted session in memory.
5. Every `/extension/capture` request must include that token.

Hardening rules:

- bind only to `127.0.0.1`
- reject non-JSON requests
- cap request body size, for example `256 KB`
- reject unknown `site` values
- reject empty extracts
- reject duplicate `eventId` within a short TTL window
- never treat the extension as fully trusted; scrub secrets again in Electron

## Dedupe Strategy

We want dedupe in two places:

### Browser-side dedupe

- debounce DOM mutation bursts
- do not emit until assistant output is stable
- ignore events where extracted user/assistant pair is unchanged from the last sent pair for that tab

### Electron-side dedupe

- reject duplicate `eventId`
- reject same `site + title + extract hash` seen in the last `10s`
- keep global capture cooldown behavior in the app

## Site Adapter Strategy

Keep extraction logic modular instead of one giant scraper.

Suggested extension structure:

```text
extension/
  manifest.json
  service-worker.ts
  shared/types.ts
  content/
    index.ts
    adapters/
      chatgpt.ts
      claude.ts
      gemini.ts
      perplexity.ts
      deepseek.ts
    utils/
      stability.ts
      dom.ts
      hashing.ts
```

Each adapter should expose the same interface:

```ts
interface SiteAdapter {
  site: 'chatgpt' | 'claude' | 'gemini' | 'perplexity' | 'deepseek'
  matches(location: Location, title: string): boolean
  waitForStableContent(): Promise<boolean>
  extractLastPair(): { user: string; assistant: string } | null
}
```

## Electron App Integration

Suggested desktop files for M3:

```text
src/main/
  browser-bridge.ts
  text-extraction.ts
  session-log.ts
  proactive-engine.ts
  user-behavior.ts
src/shared/
  ipcChannels.ts
  types.ts
```

Suggested ownership:

- `browser-bridge.ts`: localhost server and request validation
- `text-extraction.ts`: normalize extension payload into the app note model
- `main.ts`: boot bridge and wire subscribers
- `ipcChannels.ts`: add debug/status channels only if the renderer needs bridge status

## Failure Modes

Expected cases and behavior:

- Extension installed, app closed:
  - service worker marks bridge unavailable and retries later
- App open, extension not installed:
  - desktop screenshot fallback still works
- DOM selector breaks on one site:
  - adapter returns `null`, no browser capture sent, app fallback remains available
- Duplicate events:
  - dedupe in both extension and Electron
- Invalid token:
  - Electron rejects with `401`
- Large payload:
  - Electron rejects with `413`

## Logging

Keep logs useful but safe.

Extension logs:

- adapter matched site
- stability reached or timed out
- bridge request success/failure

Electron logs:

- handshake success/failure
- capture accepted/rejected
- reason for rejection: invalid token, invalid schema, duplicate, empty extract
- downstream AI latency and note write success

Do not log:

- full user messages
- assistant messages
- tokens

## Privacy And Security Notes

- The browser extension should only run on explicitly allowed AI domains.
- The extension should not request broad permissions like `<all_urls>`.
- The app should treat loopback traffic as untrusted input.
- Redaction must happen in Electron even if the extension already did cleanup.
- No browser data should go directly to third-party APIs from the extension.

## Delivery Plan For M3

### Phase 1

- Create the extension skeleton
- Implement localhost handshake
- Add one site adapter for `ChatGPT`
- Add `browser-bridge.ts` in Electron
- Verify end-to-end note creation into `session-log.jsonl`

### Phase 2

- Add Claude, Gemini, Perplexity, and DeepSeek adapters
- Add dedupe and stability guards
- Add bridge health/debug logs

### Phase 3

- Hook accepted captures into `proactive-engine.ts`
- Add setup UX for pairing extension to app
- Run manual soak testing across supported sites

## Open Decisions

These should be settled before coding:

- Should extension-fed captures fully replace browser `executeJavaScript` extraction for supported sites, or coexist behind a feature flag?
- How should the user pair the extension to the desktop app: manual token entry, deep link, or copy/paste setup screen?
- Do we want a small renderer debug screen for extension health in M3, or keep it main-process logs only?

## Recommended Decision Summary

For Milestone 3, I recommend:

- `MV3 Chrome extension`
- `content script + service worker`
- `Electron localhost HTTP bridge on 127.0.0.1`
- `session token handshake`
- `ChatGPT first, then expand adapters`
- `extension as preferred path for supported AI tabs`
- `desktop screenshot as fallback for everything else`

That keeps the architecture simple, testable, and aligned with the current Electron app.
