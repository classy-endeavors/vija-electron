import { contextBridge, ipcRenderer } from 'electron'
import type { TabKey } from '../shared/tab'

type OpenWindowPayload = { tab: TabKey }
type TrayActionPayload = { action: 'pause' | 'resume' }

contextBridge.exposeInMainWorld('vijia', {
  onOpenWindow: (callback: (payload: OpenWindowPayload) => void): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: OpenWindowPayload
    ): void => {
      callback(payload)
    }
    ipcRenderer.on('open-window', handler)
    return () => {
      ipcRenderer.removeListener('open-window', handler)
    }
  },
  onTrayAction: (
    callback: (payload: TrayActionPayload) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: TrayActionPayload
    ): void => {
      callback(payload)
    }
    ipcRenderer.on('tray-action', handler)
    return () => {
      ipcRenderer.removeListener('tray-action', handler)
    }
  }
})
