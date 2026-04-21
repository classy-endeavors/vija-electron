import type { ReactElement, Ref } from 'react'
import type { OverlayNotificationPayload } from '../../shared/notification'
import { NotificationCard } from './NotificationCard'

type Props = {
  hubRef: Ref<HTMLDivElement>
  items: OverlayNotificationPayload[]
  guideMode: boolean
  stackFaded: boolean
  onDismiss: (id: string) => void
  onGuide: () => void
  onProactiveAccepted: (item: OverlayNotificationPayload, actionId: string) => void
}

export function NotificationStack({
  hubRef,
  items,
  guideMode,
  stackFaded,
  onDismiss,
  onGuide,
  onProactiveAccepted
}: Props): ReactElement {
  return (
    <div
      ref={hubRef}
      className={`notification-hub overlay-hit${stackFaded ? ' notification-hub--faded' : ''}`}
      aria-hidden={stackFaded}
    >
      {items.map((item, index) => {
        const isNewest = index === items.length - 1
        return (
          <NotificationCard
            key={item.id}
            item={item}
            isNewest={isNewest}
            guideMode={guideMode}
            onDismiss={() => onDismiss(item.id)}
            onGuide={onGuide}
            onProactiveAccepted={onProactiveAccepted}
          />
        )
      })}
    </div>
  )
}
