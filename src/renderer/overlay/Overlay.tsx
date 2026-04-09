import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import type { OverlayNotificationPayload } from '../../shared/notification'
import { Circle } from './Circle'
import { NotificationStack } from './NotificationStack'
import { PromptBox } from './PromptBox'
import { useOverlayInteractions } from './useOverlayInteractions'

export function Overlay(): ReactElement {
  const [items, setItems] = useState<OverlayNotificationPayload[]>([])
  const [promptOpen, setPromptOpen] = useState(false)
  const [guideMode, setGuideMode] = useState(false)
  const [stackFaded, setStackFaded] = useState(false)

  const circleRef = useRef<HTMLButtonElement>(null)
  const promptRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef(new Map<string, HTMLDivElement | null>())

  const registerCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      cardRefs.current.set(id, el)
    } else {
      cardRefs.current.delete(id)
    }
  }, [])

  useEffect(() => {
    const api = window.vijia
    if (!api?.onNotification || !api.onGuideMode) {
      console.warn('[Vijia] overlay preload missing')
      return
    }
    const offNotify = api.onNotification((payload) => {
      setItems((prev) => [...prev, payload])
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

  const getInteractiveElements = useCallback((): (HTMLElement | null)[] => {
    const circle = circleRef.current
    const prompt = promptOpen ? promptRef.current : null
    const cards: (HTMLElement | null)[] = []
    if (!stackFaded) {
      for (const it of items) {
        cards.push(cardRefs.current.get(it.id) ?? null)
      }
    }
    return [circle, prompt, ...cards]
  }, [items, promptOpen, stackFaded])

  useOverlayInteractions({
    getInteractiveElements,
    guideMode,
    onStackFadeChange: setStackFaded
  })

  const togglePrompt = useCallback(() => {
    setPromptOpen((p) => !p)
  }, [])

  return (
    <div className="overlay-root">
      <div className="overlay-column">
        <NotificationStack
          items={items}
          guideMode={guideMode}
          stackFaded={stackFaded}
          onDismiss={onDismiss}
          onGuide={onGuide}
          registerCardRef={registerCardRef}
        />
        <PromptBox
          open={promptOpen}
          onClose={() => setPromptOpen(false)}
          rootRef={promptRef}
        />
        <Circle ref={circleRef} onTogglePrompt={togglePrompt} />
      </div>
    </div>
  )
}
