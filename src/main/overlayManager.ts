import { BrowserWindow, ipcMain, screen } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let overlayWindow: BrowserWindow | null = null

function getOverlayPreloadPath(): string {
  return path.join(__dirname, '../preload/overlayPreload.mjs')
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

  const { x, y, width, height } = screen.getPrimaryDisplay().workArea

  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
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
      nodeIntegration: false
    }
  })

  if (process.platform === 'darwin') {
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  overlayWindow.setIgnoreMouseEvents(true, { forward: true })

  const devUrl = overlayRendererUrl()
  if (devUrl) {
    void overlayWindow.loadURL(buildOverlayLoadUrl())
  } else {
    const htmlPath = path.join(__dirname, '../renderer/overlay.html')
    void overlayWindow.loadFile(htmlPath)
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  return overlayWindow
}

export function destroyOverlayWindow(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy()
  }
  overlayWindow = null
}

function registerSetIgnoreMouseHandler(): void {
  ipcMain.on(
    'set-ignore-mouse',
    (event, payload: { ignore: boolean }) => {
      const win = getOverlayWindow()
      if (!win || win.isDestroyed()) return
      if (event.sender !== win.webContents) return
      win.setIgnoreMouseEvents(payload.ignore, { forward: true })
    }
  )
}

registerSetIgnoreMouseHandler()
