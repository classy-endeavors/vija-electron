/// <reference types="vite/client" />

type VijiaTabKey = 'home' | 'context' | 'subscription' | 'settings'

declare global {
  interface Window {
    /** Exposed by preload; may be missing if preload failed to load. */
    vijia?: {
      onOpenWindow: (
        callback: (payload: { tab: VijiaTabKey }) => void
      ) => () => void
      onTrayAction: (
        callback: (payload: { action: 'pause' | 'resume' }) => void
      ) => () => void
    }
  }
}

export {}
