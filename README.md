# Vijia

System tray mini-app built with **Electron** (v30+), **React 18**, and **TypeScript 5**. The main window is a small SPA with four tabs; the app stays running in the tray until **Quit**.

## Requirements

- Node.js 18+ and npm

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

This starts the Vite dev server and launches Electron. A tray icon appears; use **Open Vijia** from the context menu to show the window.

## Production build

```bash
npm run build
npm run preview
```

## Typecheck

```bash
npm run typecheck
```

(`npx tsc --noEmit` — must pass with zero errors for submission.)

## Behavior notes

- **Close (×)** hides the window; the process keeps running. Use **Quit** in the tray menu to exit.
- **Open Vijia** shows or focuses the single main window and selects the **Home** tab (initial load uses `?tab=home` in the dev URL).
- Deep link: load with `?tab=subscription` (or `home` | `context` | `settings`) to set the initial tab. IPC `open-window` from the main process overrides the active tab when the window is already open.
- Optional: `openWindowWithTab` is exported from the main-process tray module for manual testing of tab routing.

## Platform

Tested workflows are intended to work on **Windows** and **macOS** (e.g. Dock hides when the window is hidden on macOS).
# vija-electron
