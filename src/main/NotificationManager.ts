import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import type {
  NotificationPriority,
  NotificationRecord,
  NotifyPayload,
  OverlayNotificationPayload
} from '../shared/notification'
import { getOverlayWebContents } from './overlayManager'
import { getMainWindow } from './windowManager'

/** Base cooldown for `normal` priority (ms). */
export const BASE_COOLDOWN_MS = 10 * 60 * 1000

const HISTORY_CAP = 50
const DISMISSALS_TO_DOUBLE = 3

let guideModeActive = false
let lastNormalShownAt = 0
let cooldownMultiplier = 1
let consecutiveDismissals = 0

const history: NotificationRecord[] = []

function effectiveCooldownMs(): number {
  return BASE_COOLDOWN_MS * cooldownMultiplier
}

function pushHistory(record: NotificationRecord): void {
  history.unshift(record)
  if (history.length > HISTORY_CAP) {
    history.length = HISTORY_CAP
  }
}

function broadcastGuideMode(): void {
  const wc = getOverlayWebContents()
  if (wc && !wc.isDestroyed()) {
    wc.send('vijia:guide-mode', { active: guideModeActive })
  }
}

function pushToOverlay(payload: OverlayNotificationPayload): void {
  const wc = getOverlayWebContents()
  if (wc && !wc.isDestroyed()) {
    wc.send('vijia:notification', payload)
  }
}

function tryEnqueue(payload: NotifyPayload): void {
  const priority: NotificationPriority = payload.priority ?? 'normal'

  if (priority === 'normal') {
    const now = Date.now()
    if (now - lastNormalShownAt < effectiveCooldownMs()) {
      return
    }
  }

  const id = randomUUID()
  const createdAt = Date.now()
  const record: NotificationRecord = {
    id,
    message: payload.message,
    contextSource: payload.contextSource,
    codeSnippet: payload.codeSnippet,
    actions: payload.actions,
    priority,
    createdAt
  }

  pushHistory(record)

  if (priority === 'normal') {
    lastNormalShownAt = createdAt
  }

  pushToOverlay(record)
}

function handleNotify(_payload: unknown): void {
  const payload = _payload as NotifyPayload
  tryEnqueue(payload)
}

function handleDismiss(_payload: unknown): void {
  const { id } = _payload as { id: string }
  consecutiveDismissals += 1
  if (consecutiveDismissals >= DISMISSALS_TO_DOUBLE) {
    cooldownMultiplier = 2
    consecutiveDismissals = 0
  }
  void id
}

function handlePromptSubmit(_payload: unknown): void {
  void (_payload as { text: string }).text
}

function handleSetGuideMode(_payload: unknown): void {
  const { active } = _payload as { active: boolean }
  guideModeActive = active
  broadcastGuideMode()
}

function getHistory(): NotificationRecord[] {
  return [...history]
}

export function simulateTestNotification(): void {
  tryEnqueue({
    message: 'Test notification from tray — Simulate Notification.',
    priority: 'important',
    contextSource: 'Vijia — QA',
    actions: [
      { id: 'guide', label: 'Guide me', kind: 'guide' },
      { id: 'dismiss', label: 'dismiss', kind: 'dismiss' }
    ]
  })
}

export function registerNotificationIpc(): void {
  ipcMain.on('vijia:notify', (event, payload) => {
    const mw = getMainWindow()
    if (!mw || mw.isDestroyed() || event.sender !== mw.webContents) {
      return
    }
    handleNotify(payload)
  })
  ipcMain.on('vijia:dismiss', (event, payload) => {
    const ow = getOverlayWebContents()
    if (!ow || ow.isDestroyed() || event.sender !== ow) {
      return
    }
    handleDismiss(payload)
  })
  ipcMain.on('vijia:prompt-submit', (event, payload) => {
    const ow = getOverlayWebContents()
    if (!ow || ow.isDestroyed() || event.sender !== ow) {
      return
    }
    handlePromptSubmit(payload)
  })
  ipcMain.on('vijia:set-guide-mode', (event, payload) => {
    const mw = getMainWindow()
    const ow = getOverlayWebContents()
    const fromMain =
      mw && !mw.isDestroyed() && event.sender === mw.webContents
    const fromOverlay =
      ow && !ow.isDestroyed() && event.sender === ow
    if (!fromMain && !fromOverlay) {
      return
    }
    handleSetGuideMode(payload)
  })
  ipcMain.handle('vijia:get-history', (event) => {
    const mw = getMainWindow()
    if (!mw || mw.isDestroyed() || event.sender !== mw.webContents) {
      return []
    }
    return getHistory()
  })
}

export function syncGuideModeToOverlay(): void {
  broadcastGuideMode()
}

export function getGuideModeActive(): boolean {
  return guideModeActive
}
