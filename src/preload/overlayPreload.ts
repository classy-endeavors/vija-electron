import { contextBridge, ipcRenderer } from 'electron'
import type { GuideModePayload, OverlayNotificationPayload } from '../shared/notification'

contextBridge.exposeInMainWorld('vijia', {
  onNotification: (
    callback: (payload: OverlayNotificationPayload) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: OverlayNotificationPayload
    ): void => {
      callback(payload)
    }
    ipcRenderer.on('vijia:notification', handler)
    return () => {
      ipcRenderer.removeListener('vijia:notification', handler)
    }
  },
  onGuideMode: (callback: (payload: GuideModePayload) => void): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: GuideModePayload
    ): void => {
      callback(payload)
    }
    ipcRenderer.on('vijia:guide-mode', handler)
    return () => {
      ipcRenderer.removeListener('vijia:guide-mode', handler)
    }
  },
  dismiss: (id: string): void => {
    ipcRenderer.send('vijia:dismiss', { id })
  },
  submitPrompt: (text: string): void => {
    ipcRenderer.send('vijia:prompt-submit', { text })
  },
  setGuideMode: (active: boolean): void => {
    ipcRenderer.send('vijia:set-guide-mode', { active })
  },
  setIgnoreMouse: (ignore: boolean): void => {
    ipcRenderer.send('set-ignore-mouse', { ignore })
  }
})
