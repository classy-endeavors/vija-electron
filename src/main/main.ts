import { app } from 'electron'
import { startBrowserBridge, stopBrowserBridge } from './browserBridge'
import { createTray } from './tray'
import {
  getOrCreateOverlayWindow,
  registerOverlayInputIpc
} from './overlayManager'
import { registerNotificationIpc } from './NotificationManager'

void app.whenReady().then(() => {
  registerNotificationIpc()
  registerOverlayInputIpc()
  void startBrowserBridge()
  getOrCreateOverlayWindow()
  createTray()
})

app.on('before-quit', () => {
  void stopBrowserBridge()
})

app.on('window-all-closed', () => {
  // Intentionally empty: the app stays in the tray until Quit.
})
