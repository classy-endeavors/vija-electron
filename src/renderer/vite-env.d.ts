/// <reference types="vite/client" />

import type { NotifyPayload, NotificationRecord } from '../shared/notification'

type VijiaTabKey = 'home' | 'context' | 'subscription' | 'settings'

type GuideModePayload = { active: boolean }

type OverlayNotificationPayload = import('../shared/notification').OverlayNotificationPayload

declare global {
  interface Window {
    /** Main window: open/tray + notify APIs. Overlay: overlay-only APIs. */
    vijia?: {
      onOpenWindow?: (
        callback: (payload: { tab: VijiaTabKey }) => void
      ) => () => void
      onTrayAction?: (
        callback: (payload: { action: 'pause' | 'resume' }) => void
      ) => () => void
      notify?: (payload: NotifyPayload) => void
      getHistory?: () => Promise<NotificationRecord[]>
      setGuideMode?: (active: boolean) => void
      onNotification?: (
        callback: (payload: OverlayNotificationPayload) => void
      ) => () => void
      onGuideMode?: (callback: (payload: GuideModePayload) => void) => () => void
      dismiss?: (id: string) => void
      submitPrompt?: (text: string) => void
      /** Overlay: maps to `set-ignore-mouse` — when true, mouse events are ignored (pass-through). */
      setIgnoreMouse?: (ignore: boolean) => void
      setOverlayOpen?: (open: boolean) => void
      setFadeState?: (faded: boolean) => void
    }
  }
}

export {}
