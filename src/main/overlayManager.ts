import { BrowserWindow, ipcMain, screen } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPC_CHANNELS } from '../shared/ipcChannels'
import {
  resetOverlayNotificationDelivery,
  setOverlayDeliveryReady,
  syncGuideModeToOverlay
} from './NotificationManager'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let overlayWindow: BrowserWindow | null = null

let overlayInputIpcRegistered = false

/** Register once at app startup (before overlay loads). */
export function registerOverlayInputIpc(): void {
  if (overlayInputIpcRegistered) {
    return
  }
  overlayInputIpcRegistered = true

  ipcMain.on(
    IPC_CHANNELS.SET_IGNORE_MOUSE,
    (event, payload: { ignore: boolean }) => {
      const ow = getOverlayWindow()
      if (!ow || ow.isDestroyed() || event.sender !== ow.webContents) {
        return
      }
      const ignore = Boolean(payload?.ignore)
      ow.setIgnoreMouseEvents(ignore, { forward: true })
    }
  )
}

function getOverlayPreloadPath(): string {
  return path.join(__dirname, '../preload/overlayPreload.cjs')
}

function overlayRendererUrl(): string | undefined {
  return process.env['ELECTRON_RENDERER_URL']
}

function buildOverlayLoadUrl(): string {
  const base = overlayRendererUrl()!
  return base.endsWith('/') ? `${base}overlay.html` : `${base}/overlay.html`
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow : null
}

export function getOverlayWebContents(): Electron.WebContents | null {
  const w = getOverlayWindow()
  return w ? w.webContents : null
}

export function getOrCreateOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow
  }

  const wa = screen.getPrimaryDisplay().workArea

  overlayWindow = new BrowserWindow({
    x: wa.x,
    y: wa.y,
    width: wa.width,
    height: wa.height,
    frame: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: true,
    focusable: true,
    webPreferences: {
      preload: getOverlayPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      // Preload imports a local bundled chunk; sandboxed preload can fail to load it.
      sandbox: false
    }
  })

  if (process.platform === 'darwin') {
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  // Start interactive so first click is capturable even before first mousemove sync.
  overlayWindow.setIgnoreMouseEvents(false, { forward: true })

  const devUrl = overlayRendererUrl()
  if (devUrl) {
    void overlayWindow.loadURL(buildOverlayLoadUrl())
  } else {
    const htmlPath = path.join(__dirname, '../renderer/overlay.html')
    void overlayWindow.loadFile(htmlPath)
  }

  overlayWindow.webContents.on('did-finish-load', () => {
    setOverlayDeliveryReady(true)
    syncGuideModeToOverlay()
  })

  overlayWindow.on('closed', () => {
    overlayWindow = null
    resetOverlayNotificationDelivery()
  })

  return overlayWindow
}

export function destroyOverlayWindow(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy()
  }
  overlayWindow = null
  resetOverlayNotificationDelivery()
}
