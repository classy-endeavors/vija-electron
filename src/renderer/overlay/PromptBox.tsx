import {
  useCallback,
  useEffect,
  useRef,
  type ReactElement,
  type Ref
} from 'react'

type Props = {
  open: boolean
  onClose: () => void
  rootRef: Ref<HTMLDivElement>
}

export function PromptBox({ open, onClose, rootRef }: Props): ReactElement | null {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      queueMicrotask(() => inputRef.current?.focus())
    }
  }, [open])

  const submit = useCallback((): void => {
    const text = inputRef.current?.value.trim() ?? ''
    if (text.length > 0) {
      window.vijia?.submitPrompt?.(text)
      if (inputRef.current) inputRef.current.value = ''
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        submit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, submit])

  if (!open) return null

  return (
    <div ref={rootRef} className="prompt-box overlay-hit">
      <input
        ref={inputRef}
        className="prompt-box__input"
        type="text"
        placeholder="Ask Vijia something..."
        aria-label="Ask Vijia"
      />
      <button
        type="button"
        className="prompt-box__send"
        aria-label="Send"
        onClick={submit}
      >
        ➤
      </button>
    </div>
  )
}
