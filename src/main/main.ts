import { app } from 'electron'
import { createTray } from './tray'

void app.whenReady().then(() => {
  createTray()
})

app.on('window-all-closed', () => {
  // Intentionally empty: the app stays in the tray until Quit.
})
