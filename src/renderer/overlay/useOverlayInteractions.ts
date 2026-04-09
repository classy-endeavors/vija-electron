import { useEffect, useRef } from 'react'

type Options = {
  /** Union of interactive rects: circle, visible cards (unless faded), prompt when open. */
  getInteractiveElements: () => (HTMLElement | null)[]
  guideMode: boolean
  onStackFadeChange: (faded: boolean) => void
}

/**
 * ~60fps mousemove: selective click-through via IPC + 3s auto-fade when the pointer
 * leaves the interactive zone (unless guide mode).
 */
export function useOverlayInteractions({
  getInteractiveElements,
  guideMode,
  onStackFadeChange
}: Options): void {
  const lastIgnoreRef = useRef<boolean | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const clearFadeTimer = (): void => {
      if (fadeTimerRef.current !== null) {
        clearTimeout(fadeTimerRef.current)
        fadeTimerRef.current = null
      }
    }

    let lastTs = 0

    const onMove = (e: MouseEvent): void => {
      const now = performance.now()
      if (now - lastTs < 16) return
      lastTs = now

      const clientX = e.clientX
      const clientY = e.clientY

      const els = getInteractiveElements().filter((x): x is HTMLElement => x !== null)
      const inside = els.some((el) => {
        const r = el.getBoundingClientRect()
        return (
          clientX >= r.left &&
          clientX <= r.right &&
          clientY >= r.top &&
          clientY <= r.bottom
        )
      })

      const ignore = !inside
      if (lastIgnoreRef.current !== ignore) {
        lastIgnoreRef.current = ignore
        window.vijia?.setIgnoreMouse?.(ignore)
      }

      if (inside) {
        clearFadeTimer()
        onStackFadeChange(false)
        return
      }

      if (guideMode) {
        clearFadeTimer()
        return
      }

      clearFadeTimer()
      fadeTimerRef.current = setTimeout(() => {
        fadeTimerRef.current = null
        onStackFadeChange(true)
      }, 3000)
    }

    document.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      document.removeEventListener('mousemove', onMove)
      clearFadeTimer()
    }
  }, [getInteractiveElements, guideMode, onStackFadeChange])
}
