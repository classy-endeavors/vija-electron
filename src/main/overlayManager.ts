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
let lastIgnoreMouse = false

function getOverlayAlwaysOnTopLevel():
  | 'floating'
  | 'screen-saver'
  | 'normal' {
  if (process.platform === 'darwin') {
    return 'screen-saver'
  }
  if (process.platform === 'win32') {
    return 'floating'
  }
  return 'normal'
}

function applyOverlayWindowState(win: BrowserWindow): void {
  const primary = screen.getPrimaryDisplay()
  const { x, y } = primary.workArea
  const { width, height } = primary.workAreaSize
  win.setBounds({ x, y, width, height })
  win.setAlwaysOnTop(true, getOverlayAlwaysOnTopLevel())
}

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
      lastIgnoreMouse = ignore
      ow.setIgnoreMouseEvents(ignore, { forward: true })
    }
  )

  ipcMain.on(
    IPC_CHANNELS.VIJIA_OVERLAY_TOGGLE,
    (event, _payload: { open: boolean }) => {
      const ow = getOverlayWindow()
      if (!ow || ow.isDestroyed() || event.sender !== ow.webContents) {
        return
      }
      applyOverlayWindowState(ow)
    }
  )

  ipcMain.on(
    IPC_CHANNELS.VIJIA_FADE_STATE,
    (event, _payload: { faded: boolean }) => {
      const ow = getOverlayWindow()
      if (!ow || ow.isDestroyed() || event.sender !== ow.webContents) {
        return
      }
      ow.setIgnoreMouseEvents(lastIgnoreMouse, { forward: true })
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

  const primary = screen.getPrimaryDisplay()
  const wa = primary.workArea
  const waSize = primary.workAreaSize

  overlayWindow = new BrowserWindow({
    x: wa.x,
    y: wa.y,
    width: waSize.width,
    height: waSize.height,
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
  applyOverlayWindowState(overlayWindow)
  overlayWindow.on('show', () => applyOverlayWindowState(overlayWindow!))
  overlayWindow.on('restore', () => applyOverlayWindowState(overlayWindow!))
  overlayWindow.on('enter-full-screen', () => applyOverlayWindowState(overlayWindow!))
  overlayWindow.on('leave-full-screen', () => applyOverlayWindowState(overlayWindow!))

  // Start interactive so first click is capturable even before first mousemove sync.
  lastIgnoreMouse = false
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
