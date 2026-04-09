import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import type { OverlayNotificationPayload } from '../../shared/notification'
import { Circle } from './Circle'
import { NotificationStack } from './NotificationStack'
import { PromptBox } from './PromptBox'
import { useOverlayInteractions } from './useOverlayInteractions'

/** Spec: two stacked cards; show the two most recent. */
const MAX_VISIBLE_NOTIFICATIONS = 2

export function Overlay(): ReactElement {
  const [items, setItems] = useState<OverlayNotificationPayload[]>([])
  const [promptOpen, setPromptOpen] = useState(false)
  const [guideMode, setGuideMode] = useState(false)
  const [stackFaded, setStackFaded] = useState(false)
  const [hoveredOlderId, setHoveredOlderId] = useState<string | null>(null)

  const promptSourceRef = useRef<'none' | 'circle' | 'hover'>('none')
  const promptLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const columnRef = useRef<HTMLDivElement>(null)
  const promptRef = useRef<HTMLDivElement>(null)

  const visibleItems =
    items.length <= MAX_VISIBLE_NOTIFICATIONS
      ? items
      : items.slice(-MAX_VISIBLE_NOTIFICATIONS)

  useEffect(() => {
    const api = window.vijia
    if (!api?.onNotification || !api.onGuideMode) {
      console.warn('[Vijia] overlay preload missing')
      return
    }
    const offNotify = api.onNotification((payload) => {
      setItems((prev) => [...prev, payload])
      setStackFaded(false)
    })
    const offGuide = api.onGuideMode(({ active }) => {
      setGuideMode(active)
      if (active) {
        setStackFaded(false)
      }
    })
    return () => {
      offNotify()
      offGuide()
    }
  }, [])

  const onDismiss = useCallback((id: string) => {
    window.vijia?.dismiss?.(id)
    setItems((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const onGuide = useCallback(() => {
    window.vijia?.setGuideMode?.(true)
  }, [])

  const clearPromptLeaveTimer = useCallback((): void => {
    if (promptLeaveTimerRef.current !== null) {
      clearTimeout(promptLeaveTimerRef.current)
      promptLeaveTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (
      hoveredOlderId &&
      !visibleItems.some((i) => i.id === hoveredOlderId)
    ) {
      setHoveredOlderId(null)
      if (promptSourceRef.current === 'hover') {
        clearPromptLeaveTimer()
        setPromptOpen(false)
        promptSourceRef.current = 'none'
      }
    }
  }, [visibleItems, hoveredOlderId, clearPromptLeaveTimer])

  const onHoveredOlderChange = useCallback(
    (id: string | null) => {
      setHoveredOlderId(id)
      if (id !== null) {
        clearPromptLeaveTimer()
        setPromptOpen(true)
        if (promptSourceRef.current === 'none') {
          promptSourceRef.current = 'hover'
        }
        return
      }
      clearPromptLeaveTimer()
      promptLeaveTimerRef.current = setTimeout(() => {
        promptLeaveTimerRef.current = null
        if (promptSourceRef.current === 'hover') {
          setPromptOpen(false)
          promptSourceRef.current = 'none'
        }
      }, 200)
    },
    [clearPromptLeaveTimer]
  )

  const onPromptRootEnter = useCallback(() => {
    clearPromptLeaveTimer()
  }, [clearPromptLeaveTimer])

  /** Single rect for the whole stack + prompt + FAB so hit-test matches layout and gaps. */
  const getInteractiveElements = useCallback((): (HTMLElement | null)[] => {
    return [columnRef.current]
  }, [promptOpen, items.length])

  useOverlayInteractions({
    getInteractiveElements,
    guideMode,
    onStackFadeChange: setStackFaded
  })

  const togglePrompt = useCallback(() => {
    clearPromptLeaveTimer()
    setPromptOpen((p) => {
      const next = !p
      promptSourceRef.current = next ? 'circle' : 'none'
      return next
    })
  }, [clearPromptLeaveTimer])

  const closePrompt = useCallback(() => {
    clearPromptLeaveTimer()
    setPromptOpen(false)
    promptSourceRef.current = 'none'
  }, [clearPromptLeaveTimer])

  return (
    <div className="overlay-root">
      <div ref={columnRef} className="overlay-column">
        <NotificationStack
          items={visibleItems}
          guideMode={guideMode}
          stackFaded={stackFaded}
          hoveredOlderId={hoveredOlderId}
          onHoveredOlderChange={onHoveredOlderChange}
          onDismiss={onDismiss}
          onGuide={onGuide}
        />
        <PromptBox
          open={promptOpen}
          onClose={closePrompt}
          rootRef={promptRef}
          onRootPointerEnter={onPromptRootEnter}
        />
        <Circle onTogglePrompt={togglePrompt} />
      </div>
    </div>
  )
}
