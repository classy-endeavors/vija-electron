import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

type Options = {
  /** Bounding element(s) for the bottom-right UI cluster (e.g. `.overlay-column`). */
  getInteractiveElements: () => (HTMLElement | null)[]
  guideMode: boolean
  onStackFadeChange: (faded: boolean) => void
}

/**
 * Stack fade when the pointer leaves interactive UI; `set-ignore-mouse` toggles native
 * hit-testing so transparent regions pass clicks through (`forward: true` keeps mousemove).
 *
 * Hit-test runs synchronously on mousemove (not rAF) so `setIgnoreMouse(false)` applies
 * before click; layout sync re-runs after React commits so refs/rects match the DOM.
 */
export function useOverlayInteractions({
  getInteractiveElements,
  guideMode,
  onStackFadeChange
}: Options): void {
  const getElsRef = useRef(getInteractiveElements)
  getElsRef.current = getInteractiveElements
  const guideModeRef = useRef(guideMode)
  guideModeRef.current = guideMode
  const onStackFadeChangeRef = useRef(onStackFadeChange)
  onStackFadeChangeRef.current = onStackFadeChange

  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastIgnoreMouseRef = useRef<boolean | null>(null)
  const lastClientPointRef = useRef({ x: -1, y: -1 })

  const clearFadeTimer = useCallback((): void => {
    if (fadeTimerRef.current !== null) {
      clearTimeout(fadeTimerRef.current)
      fadeTimerRef.current = null
    }
  }, [])

  const sync = useCallback(
    (clientX: number, clientY: number): void => {
      const els = getElsRef.current().filter((x): x is HTMLElement => x !== null)
      const inside = els.some((el) => {
        const r = el.getBoundingClientRect()
        return (
          clientX >= r.left &&
          clientX <= r.right &&
          clientY >= r.top &&
          clientY <= r.bottom
        )
      })

      /** Same as Electron `setIgnoreMouseEvents(ignore)`: true = let clicks pass through to windows below. */
      const ignore = !inside
      if (lastIgnoreMouseRef.current !== ignore) {
        lastIgnoreMouseRef.current = ignore
        window.vijia?.setIgnoreMouse?.(ignore)
      }

      if (inside) {
        clearFadeTimer()
        onStackFadeChangeRef.current(false)
        return
      }

      if (guideModeRef.current) {
        clearFadeTimer()
        return
      }

      clearFadeTimer()
      fadeTimerRef.current = setTimeout(() => {
        fadeTimerRef.current = null
        onStackFadeChangeRef.current(true)
      }, 3000)
    },
    [clearFadeTimer]
  )

  useLayoutEffect(() => {
    const p = lastClientPointRef.current
    if (p.x < 0) return
    sync(p.x, p.y)
  }, [getInteractiveElements, guideMode, sync])

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      lastClientPointRef.current = { x: e.clientX, y: e.clientY }
      sync(e.clientX, e.clientY)
    }
    document.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      document.removeEventListener('mousemove', onMove)
      clearFadeTimer()
      if (lastIgnoreMouseRef.current === true) {
        window.vijia?.setIgnoreMouse?.(false)
      }
      lastIgnoreMouseRef.current = null
    }
  }, [sync, clearFadeTimer])
}
