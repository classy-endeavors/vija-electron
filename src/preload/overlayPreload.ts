import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipcChannels'
import type { GuideModePayload, OverlayNotificationPayload } from '../shared/notification'

/** Single IPC listener + buffer so main can push before React mounts (dev HMR / slow bundle). */
let notificationCallback: ((payload: OverlayNotificationPayload) => void) | null = null
const notificationBuffer: OverlayNotificationPayload[] = []

ipcRenderer.on(
  IPC_CHANNELS.VIJIA_NOTIFICATION,
  (_event, payload: OverlayNotificationPayload) => {
    if (notificationCallback) {
      notificationCallback(payload)
    } else {
      notificationBuffer.push(payload)
    }
  }
)

let guideCallback: ((payload: GuideModePayload) => void) | null = null
let guideBuffered: GuideModePayload | null = null

ipcRenderer.on(IPC_CHANNELS.VIJIA_GUIDE_MODE, (_event, payload: GuideModePayload) => {
  if (guideCallback) {
    guideCallback(payload)
  } else {
    guideBuffered = payload
  }
})

contextBridge.exposeInMainWorld('vijia', {
  onNotification: (
    callback: (payload: OverlayNotificationPayload) => void
  ): (() => void) => {
    notificationCallback = callback
    while (notificationBuffer.length > 0) {
      const p = notificationBuffer.shift()
      if (p) callback(p)
    }
    return () => {
      notificationCallback = null
    }
  },
  onGuideMode: (callback: (payload: GuideModePayload) => void): (() => void) => {
    guideCallback = callback
    if (guideBuffered) {
      callback(guideBuffered)
      guideBuffered = null
    }
    return () => {
      guideCallback = null
    }
  },
  dismiss: (id: string): void => {
    ipcRenderer.send(IPC_CHANNELS.VIJIA_DISMISS, { id })
  },
  notifyNotificationOutcome: (payload: {
    notificationId: string
    outcome: 'accepted' | 'dismissed'
    actionId?: string
  }): void => {
    ipcRenderer.send(IPC_CHANNELS.VIJIA_NOTIFICATION_OUTCOME, payload)
  },
  submitPrompt: (text: string): void => {
    ipcRenderer.send(IPC_CHANNELS.VIJIA_PROMPT_SUBMIT, { text })
  },
  setGuideMode: (active: boolean): void => {
    ipcRenderer.send(IPC_CHANNELS.VIJIA_SET_GUIDE_MODE, { active })
  },
  setIgnoreMouse: (ignore: boolean): void => {
    ipcRenderer.send(IPC_CHANNELS.SET_IGNORE_MOUSE, { ignore })
  },
  setOverlayOpen: (open: boolean): void => {
    ipcRenderer.send(IPC_CHANNELS.VIJIA_OVERLAY_TOGGLE, { open })
  },
  setFadeState: (faded: boolean): void => {
    ipcRenderer.send(IPC_CHANNELS.VIJIA_FADE_STATE, { faded })
  }
})
