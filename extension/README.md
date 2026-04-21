# Vijia Browser Extension

This is the Milestone 3 Chrome extension scaffold for sending AI-chat browser context to the local Vijia Electron app.

## Current Shape

- `content-script.js` watches supported AI chat pages
- `site-adapters.js` provides simple site matching and extraction heuristics
- `service-worker.js` forwards captures to the Electron localhost bridge
- `options.html` and `options.js` let you configure bridge URL and session token

## Supported Sites

- ChatGPT
- Claude
- Gemini
- Perplexity
- DeepSeek

## Load Unpacked

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this `extension/` folder
5. Open the extension options page and set the bridge URL and token

## Bridge Defaults

- URL: `http://127.0.0.1:45731`
- Token: must match the Electron app token

## Pairing

When the Electron app starts, it writes a local config file named `browser-extension-bridge.json` under the app's Electron `userData` folder. Use the `bridgeUrl` and `sessionToken` values from that file in the extension options page.

## Notes

- Extraction is intentionally heuristic right now and should be tightened per site during Milestone 3 implementation.
- The extension currently forwards raw last-pair text to Electron; the app remains responsible for final scrubbing, dedupe, persistence, and downstream AI calls.
