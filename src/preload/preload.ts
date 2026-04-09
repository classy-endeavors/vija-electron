import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipcChannels'
import type { TabKey } from '../shared/tab'
import type { NotificationRecord, NotifyPayload } from '../shared/notification'

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
    ipcRenderer.on(IPC_CHANNELS.OPEN_WINDOW, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.OPEN_WINDOW, handler)
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
    ipcRenderer.on(IPC_CHANNELS.TRAY_ACTION, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TRAY_ACTION, handler)
    }
  },
  notify: (payload: NotifyPayload): void => {
    ipcRenderer.send(IPC_CHANNELS.VIJIA_NOTIFY, payload)
  },
  getHistory: (): Promise<NotificationRecord[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.VIJIA_GET_HISTORY)
  },
  setGuideMode: (active: boolean): void => {
    ipcRenderer.send(IPC_CHANNELS.VIJIA_SET_GUIDE_MODE, { active })
  }
})
