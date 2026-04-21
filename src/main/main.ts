import { app } from 'electron'
import { startBrowserBridge, stopBrowserBridge } from './browserBridge'
import { createTray } from './tray'
import {
  getOrCreateOverlayWindow,
  registerOverlayInputIpc
} from './overlayManager'
import { registerNotificationIpc } from './NotificationManager'
import { startProactiveEngine, stopProactiveEngine } from './proactive-engine'

void app.whenReady().then(() => {
  registerNotificationIpc()
  registerOverlayInputIpc()
  void startBrowserBridge()
  startProactiveEngine()
  getOrCreateOverlayWindow()
  createTray()
})

app.on('before-quit', () => {
  stopProactiveEngine()
  void stopBrowserBridge()
})

app.on('window-all-closed', () => {
  // Intentionally empty: the app stays in the tray until Quit.
})
