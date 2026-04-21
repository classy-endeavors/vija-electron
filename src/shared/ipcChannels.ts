/**
 * Single source of truth for IPC channel names (preload + main).
 * Renderer must never touch ipcRenderer directly; only contextBridge APIs use these.
 */
export const IPC_CHANNELS = {
  /** Main window: main -> renderer */
  OPEN_WINDOW: 'open-window',
  /** Main window: main -> renderer */
  TRAY_ACTION: 'tray-action',

  /** Renderer -> main: enqueue notification */
  VIJIA_NOTIFY: 'vijia:notify',
  /** Main -> renderer: push notification to overlay */
  VIJIA_NOTIFICATION: 'vijia:notification',
  /** Renderer -> main: user dismissed a card */
  VIJIA_DISMISS: 'vijia:dismiss',
  /** Renderer -> main: prompt submission */
  VIJIA_PROMPT_SUBMIT: 'vijia:prompt-submit',
  /** Renderer -> main: toggle guide mode */
  VIJIA_SET_GUIDE_MODE: 'vijia:set-guide-mode',
  /** Main -> renderer: guide mode state */
  VIJIA_GUIDE_MODE: 'vijia:guide-mode',
  /** Renderer -> main (invoke): notification history */
  VIJIA_GET_HISTORY: 'vijia:get-history',
  /** Renderer → main: overlay hit-testing / pass-through */
  SET_IGNORE_MOUSE: 'set-ignore-mouse',
  /** Renderer → main: overlay open/close state */
  VIJIA_OVERLAY_TOGGLE: 'vijia:overlay-toggle',
  /** Renderer → main: notification hub fade transitions */
  VIJIA_FADE_STATE: 'vijia:fade-state',
  /** Main → renderer: a line was appended to session-log.jsonl */
  VIJIA_NOTE_APPENDED: 'vijia:note-appended',
  /** Renderer → main: accept / dismiss / fade outcome for suggestion notifications */
  VIJIA_NOTIFICATION_OUTCOME: 'vijia:notification-outcome',
  /** Renderer -> main (invoke): local browser bridge status */
  VIJIA_GET_BROWSER_BRIDGE_STATUS: 'vijia:get-browser-bridge-status'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
