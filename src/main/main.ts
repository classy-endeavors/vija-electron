import { app } from 'electron'
import { createTray } from './tray'
import {
  getOrCreateOverlayWindow,
  registerOverlayInputIpc
} from './overlayManager'
import { registerNotificationIpc } from './NotificationManager'

void app.whenReady().then(() => {
  registerNotificationIpc()
  registerOverlayInputIpc()
  getOrCreateOverlayWindow()
  createTray()
})

app.on('window-all-closed', () => {
  // Intentionally empty: the app stays in the tray until Quit.
})
