import type { ReactElement } from 'react'
import type { OverlayNotificationPayload } from '../../shared/notification'
import { NotificationCard } from './NotificationCard'

type Props = {
  items: OverlayNotificationPayload[]
  guideMode: boolean
  stackFaded: boolean
  hoveredOlderId: string | null
  onHoveredOlderChange: (id: string | null) => void
  onDismiss: (id: string) => void
  onGuide: () => void
}

export function NotificationStack({
  items,
  guideMode,
  stackFaded,
  hoveredOlderId,
  onHoveredOlderChange,
  onDismiss,
  onGuide
}: Props): ReactElement {
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
            item={item}
            isNewest={isNewest}
            expandedOlder={expandedOlder}
            guideMode={guideMode}
            onDismiss={() => onDismiss(item.id)}
            onGuide={onGuide}
            onHoverOlder={(hover) => {
              onHoveredOlderChange(hover ? item.id : null)
            }}
          />
        )
      })}
    </div>
  )
}
