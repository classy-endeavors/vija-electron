import { Menu, Tray, nativeImage, app } from 'electron'
import path from 'node:path'
import {
  destroyAllWindows,
  getMainWindow,
  setQuitting,
  showMainWindow
} from './windowManager'
import type { TabKey } from '../shared/tab'

let tray: Tray | null = null

function trayIconPath(): string {
  return path.join(app.getAppPath(), 'assets', 'letter-v.png')
}

export function createTray(): void {
  const icon = nativeImage.createFromPath(trayIconPath())
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Vijia',
      click: (): void => {
        showMainWindow('home')
      }
    },
    {
      label: 'Pause',
      click: (): void => {
        console.log('[Vijia] Pause (placeholder)')
        getMainWindow()?.webContents.send('tray-action', { action: 'pause' })
      }
    },
    {
      label: 'Resume',
      click: (): void => {
        console.log('[Vijia] Resume (placeholder)')
        getMainWindow()?.webContents.send('tray-action', { action: 'resume' })
      }
    },
    {
      label: 'Quit',
      click: (): void => {
        setQuitting(true)
        destroyAllWindows()
        app.quit()
      }
    }
  ])

  tray.setToolTip('Vijia')
  tray.setContextMenu(contextMenu)
}

/** Exposed for tests / programmatic navigation (e.g. AC-05). */
export function openWindowWithTab(tab: TabKey): void {
  showMainWindow(tab)
}
