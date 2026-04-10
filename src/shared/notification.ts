export type NotificationPriority = 'normal' | 'important' | 'system'

export type NotificationAction = {
  id: string
  label: string
  kind?: 'guide' | 'dismiss' | 'custom'
}

export type NotifyPayload = {
  message: string
  /** Optional one-line context, e.g. "VS Code — auth.ts" */
  contextSource?: string
  /** Optional code snippet rendered in monospace block */
  codeSnippet?: string
  actions?: NotificationAction[]
  priority?: NotificationPriority
}

export type NotificationRecord = NotifyPayload & {
  id: string
  priority: NotificationPriority
  createdAt: number
}

/** Main → overlay push shape */
export type OverlayNotificationPayload = NotificationRecord

export type GuideModePayload = {
  active: boolean
}
