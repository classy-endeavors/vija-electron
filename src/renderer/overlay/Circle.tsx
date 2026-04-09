import {
  forwardRef,
  type ReactElement,
  type Ref
} from 'react'

type Props = {
  onTogglePrompt: () => void
}

export const Circle = forwardRef(function Circle(
  { onTogglePrompt }: Props,
  ref: Ref<HTMLButtonElement>
): ReactElement {
  return (
    <button
      type="button"
      ref={ref}
      className="vijia-circle overlay-hit"
      aria-label="Toggle Vijia prompt"
      onClick={onTogglePrompt}
    >
      <span className="vijia-circle__dot" aria-hidden />
    </button>
  )
})

Circle.displayName = 'Circle'
