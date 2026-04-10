import type { ReactElement } from 'react'

type Props = {
  onTogglePrompt: () => void
}

export function Circle({ onTogglePrompt }: Props): ReactElement {
  return (
    <button
      type="button"
      className="vijia-circle overlay-hit"
      aria-label="Toggle Vijia prompt"
      onClick={onTogglePrompt}
    >
      <span className="vijia-circle__dot" aria-hidden />
    </button>
  )
}
