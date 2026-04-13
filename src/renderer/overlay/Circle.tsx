import { forwardRef, type ReactElement } from 'react'

type Props = {
  onTogglePrompt: () => void
}

export const Circle = forwardRef<HTMLButtonElement, Props>(function Circle(
  { onTogglePrompt },
  ref
): ReactElement {
  return (
    <button
      ref={ref}
      type="button"
      className="vijia-circle overlay-hit"
      aria-label="Toggle Vijia prompt"
      onClick={onTogglePrompt}
    >
      <span className="vijia-circle__dot" aria-hidden />
    </button>
  )
})
