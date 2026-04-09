import { useCallback, useState, type ReactElement } from 'react'
import type { OverlayNotificationPayload } from '../../shared/notification'
import { NotificationCard } from './NotificationCard'

type Props = {
  items: OverlayNotificationPayload[]
  guideMode: boolean
  stackFaded: boolean
  onDismiss: (id: string) => void
  onGuide: () => void
  registerCardRef: (id: string, el: HTMLDivElement | null) => void
}

export function NotificationStack({
  items,
  guideMode,
  stackFaded,
  onDismiss,
  onGuide,
  registerCardRef
}: Props): ReactElement {
  const [hoveredOlderId, setHoveredOlderId] = useState<string | null>(null)

  const setRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      registerCardRef(id, el)
    },
    [registerCardRef]
  )

  return (
    <div
      className={`notification-stack${stackFaded ? ' notification-stack--faded' : ''}`}
      aria-hidden={stackFaded}
    >
      {items.map((item, index) => {
        const isNewest = index === items.length - 1
        const expandedOlder =
          !isNewest && hoveredOlderId === item.id

        return (
          <NotificationCard
            key={item.id}
            ref={setRef(item.id)}
            item={item}
            isNewest={isNewest}
            expandedOlder={expandedOlder}
            guideMode={guideMode}
            onDismiss={() => onDismiss(item.id)}
            onGuide={onGuide}
            onHoverOlder={(hover) => {
              setHoveredOlderId(hover ? item.id : null)
            }}
          />
        )
      })}
    </div>
  )
}
