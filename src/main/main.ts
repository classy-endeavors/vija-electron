import { app } from 'electron'
import { createTray } from './tray'
import { getOrCreateOverlayWindow } from './overlayManager'
import { registerNotificationIpc, syncGuideModeToOverlay } from './NotificationManager'

void app.whenReady().then(() => {
  registerNotificationIpc()
  const overlay = getOrCreateOverlayWindow()
  overlay.webContents.once('did-finish-load', () => {
    syncGuideModeToOverlay()
  })
  createTray()
})

app.on('window-all-closed', () => {
  // Intentionally empty: the app stays in the tray until Quit.
})
