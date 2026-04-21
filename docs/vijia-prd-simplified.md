# Vijia PRD Simplified Reference

Source: `c:\Users\siddh\Downloads\Vijia_PRD_Milestones_3-4-5_v1.2.docx.txt`  
Version summarized: `v1.2` dated `April 16, 2026`

## What This Covers

This PRD defines three follow-on milestones for the Vijia Electron app:

1. `Milestone 3`: Text extraction from AI chats plus proactive suggestions
2. `Milestone 4`: Behavior synthesis plus session lifecycle summaries
3. `Milestone 5`: Guide Mode improvements

Core intent:

- Reuse the existing Electron app, notification system, tray behavior, and Supabase Edge Functions
- Keep AI calls in the main process through Supabase only
- Store useful history locally so later features can build on previous context
- Deliver incrementally with clear acceptance criteria per milestone

## Timeline

| Milestone | Focus | Duration | Target Due |
| --- | --- | --- | --- |
| M3 | Text extraction + proactive suggestions | ~8 days | Apr 24, 2026 |
| M4 | Pattern synthesis + session lifecycle | ~7 days | May 1, 2026 |
| M5 | Guide Mode improvements | ~7 days | May 8, 2026 |

## Shared Product Rules

- Existing app architecture is the source of truth; this PRD extends it rather than replacing it.
- Never capture Vijia itself. If Vijia is the active window, skip the full pipeline.
- Screenshots are processed in memory only and never written to disk.
- AI APIs are never called directly from Electron. All AI traffic goes through Supabase Edge Functions.
- Auth tokens use `safeStorage`, not renderer storage.
- IPC channel names use the `vijia:` prefix and live in `src/shared/ipcChannels.ts`.
- Security defaults stay strict: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`.

## Milestone 3

### Goal

Improve context capture by extracting text from supported AI chat sites, then decide whether Vijia should proactively notify the user.

### Part A: Text Extraction

Supported sites are detected from the active window title:

- `ChatGPT`
- `Claude`
- `Gemini`
- `Perplexity`
- `DeepSeek`

Flow:

1. A capture trigger fires from app-switch, tab-switch, typing-stop, scroll-pause, or typing-start.
2. A global `10s` debounce prevents capture bursts.
3. If the active window is an AI chat site, Vijia reads `document.body.innerText`.
4. It waits for streaming to stabilize by comparing two reads `1s` apart.
5. It extracts only the last user/assistant message pair.
6. It redacts obvious secrets before sending data anywhere.
7. It sends the extracted text to `gemini-proxy`.
8. It stores the resulting note in `data/session-log.jsonl`.
9. It emits `vijia:note-appended`.

Fallback:

- If the active app is not a supported AI chat site, Vijia uses the existing screenshot analysis path.

Important limits:

- User text is capped at `4 KB`
- Assistant text is capped at `12 KB`
- Streaming waits up to `20s`, then skips note creation for that attempt

### M3 Data Written

`data/session-log.jsonl`

- One JSONL row per successful analysis note
- Includes source, site, app, window title, extracted text, analysis summary, model, latency, and schema version

### Part B: Proactive Suggestions

Trigger:

- Runs whenever `vijia:note-appended` fires

Inputs:

- Last `10` notes from `session-log.jsonl`
- Full `user-behavior.json`

Flow:

1. Call `claude-proxy` in proactive mode.
2. If response says `should_speak: false`, do nothing.
3. If response says `should_speak: true`, send a normal-priority notification through `NotificationManager`.
4. When the user accepts or dismisses, update `user-behavior.json` suggestion stats and history.

Expected proactive response:

- Silent: `{ "should_speak": false }`
- Spoken: `should_speak`, `message`, `type`, `buttons`

Allowed suggestion types:

- `guide_offer`
- `personal_context`
- `return_nudge`
- `important_flag`
- `task_switch`

### M3 Main Deliverables

- `src/main/text-extraction.ts`
- `src/main/session-log.ts`
- `src/main/proactive-engine.ts`
- `src/main/user-behavior.ts`
- `src/shared/ipcChannels.ts` update for `vijia:note-appended`
- `src/main/main.ts` wiring updates

## Milestone 4

### Goal

Generate lightweight behavioral summaries during the day and session summaries at start/end of day.

### Part A: Pattern Synthesis

Flow:

1. A main-process timer runs every `5 minutes` while the app is active and not paused.
2. It uses the last `10-15` notes.
3. If fewer than `3` recent notes exist, skip the cycle.
4. It calls Claude for a compact behavior summary.
5. It appends the result to `data/behavior-summaries.jsonl`.
6. It atomically overwrites `data/current-behavior.json`.

Behavior summary should capture:

- themes
- mood
- blockers
- wins
- likely next action
- short headline

Settings:

- Synthesis interval is configurable in Settings
- Default `5 min`
- Allowed range `1-30 min`

### Part B: Session Lifecycle

Two user-facing outputs:

- Morning briefing on the first launch of a new local day
- Day summary when quitting or at local midnight

Rules:

- Window close does not end a session; it only hides the app
- Tray `Quit` does end the session
- Midnight can generate a silent rollup even if the app stays open
- If Claude is unavailable during quit, generate a deterministic local fallback summary

Storage:

- `electron-store` holds session history and latest session summary data
- JSONL remains for high-volume behavior summaries

### M4 Data Written

Files:

- `data/behavior-summaries.jsonl`
- `data/current-behavior.json`

Electron store:

- `session-history[]` for session start, session end, and midnight rollup records

### M4 Main Deliverables

- `src/main/synthesis-scheduler.ts`
- `src/main/session-lifecycle.ts`
- Settings support for synthesis interval
- Proactive engine update to optionally include `current-behavior.json`

## Milestone 5

### Goal

Turn Guide Mode into a real guided workflow that can advance automatically and gently correct the user if they go off-path.

### Guide Lifecycle

Guide sources:

- A proactive `Guide me` suggestion
- The overlay prompt box
- Replay/read-only history entry from the Home tab

Flow:

1. Start a guide for a user goal.
2. Claude returns `2-12` steps plus metadata.
3. Vijia shows the current step as a pinned notification.
4. Each new note is checked against the current step's predicate.
5. If the predicate is satisfied, the guide auto-advances.
6. If the user seems off-path for multiple checks, show a correction notification.
7. On completion or exit, write the guide session to `data/guides.jsonl`.

Guide behavior:

- Only one guide can be active at a time
- Active guide notifications do not auto-fade
- Pinned guide card exposes `Next`, `Skip`, and `End`
- Normal proactive notifications are suppressed while a guide is active

### Guide Record

`data/guides.jsonl`

- Goal
- Start/end timestamps
- Source
- Step list with predicates and outcomes
- Final outcome: completed, abandoned, or failed

### M5 Main Deliverables

- `src/main/guide-manager.ts`
- Overlay support for pinned step cards
- Predicate evaluator for step completion
- Correction notification logic
- Guide history entry point in the UI if included in scope

## Shared Storage Summary

| Storage | Purpose |
| --- | --- |
| `data/session-log.jsonl` | Raw analyzed notes from capture pipeline |
| `data/user-behavior.json` | User behavior profile and suggestion stats |
| `data/behavior-summaries.jsonl` | Periodic synthesis history |
| `data/current-behavior.json` | Latest synthesis snapshot |
| `data/guides.jsonl` | Completed/abandoned guide sessions |
| `electron-store session-history[]` | Morning briefings and day summaries |

## Shared IPC Summary

Important channels called out in the PRD:

- `vijia:capture-trigger`
- `vijia:note-appended`
- `vijia:proactive-decision`
- `vijia:synthesis-updated`
- `vijia:session-briefing`
- `vijia:session-day-summary`
- `vijia:guide-start`
- `vijia:guide-advance`
- `vijia:guide-end`
- `vijia:notification-outcome`

## Key Acceptance Themes

The repeated acceptance pattern across the milestones is:

- stable capture behavior with debounce and self-skip
- resilient local persistence with atomic writes
- graceful failure if AI calls or parsing fail
- no secret leakage
- user-visible behavior that feels helpful, not noisy
- milestone-by-milestone demos and soak testing

## Open Questions Still Called Out In The PRD

- `Q2`: whether proactive notifications should replay on launch
- `Q4`: whether morning briefings should include action buttons
- `Q5`: retention/archive policy for summary history
- `Q6`: when guide predicates should be generated
- `Q7`: how aggressive off-path correction should be
- `Q8`: whether Guide history UI lands in M5
- `Q9`: whether all proactive suggestion types are enabled in M3 or only a subset

## Recommended Use Of This File

Use this document as a quick engineering reference. For exact schemas, edge cases, and final acceptance wording, refer back to the original full PRD.
