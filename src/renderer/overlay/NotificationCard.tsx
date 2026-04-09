import type { ReactElement } from 'react'
import type { NotificationAction, OverlayNotificationPayload } from '../../shared/notification'

const DEFAULT_ACTIONS: NotificationAction[] = [
  { id: 'guide', label: 'Guide me', kind: 'guide' },
  { id: 'dismiss', label: 'dismiss', kind: 'dismiss' }
]

function firstLine(message: string): string {
  const line = message.split(/\r?\n/)[0]
  return line ?? ''
}

type Props = {
  item: OverlayNotificationPayload
  isNewest: boolean
  expandedOlder: boolean
  guideMode: boolean
  onDismiss: () => void
  onGuide: () => void
  onHoverOlder: (hover: boolean) => void
}

export function NotificationCard({
  item,
  isNewest,
  expandedOlder,
  guideMode,
  onDismiss,
  onGuide,
  onHoverOlder
}: Props): ReactElement {
  const actions = item.actions?.length ? item.actions : DEFAULT_ACTIONS
  const showFull =
    isNewest || expandedOlder

  const bodyText = showFull ? item.message : firstLine(item.message)
  const collapsedOlder = !isNewest && !expandedOlder

  return (
    <div
      className={`notification-card overlay-hit${guideMode ? ' notification-card--guide' : ''}${
        !isNewest ? ' notification-card--older' : ''
      }${!isNewest && expandedOlder ? ' notification-card--expanded' : ''}`}
      onMouseEnter={() => {
        if (!isNewest) onHoverOlder(true)
      }}
      onMouseLeave={() => {
        if (!isNewest) onHoverOlder(false)
      }}
    >
      {!collapsedOlder && item.contextSource ? (
        <div className="notification-card__context">{item.contextSource}</div>
      ) : null}
      {!collapsedOlder && item.codeSnippet ? (
        <pre className="notification-card__code">{item.codeSnippet}</pre>
      ) : null}
      <div className="notification-card__body">{bodyText}</div>
      {isNewest ? (
        <div className="notification-card__actions">
          {actions.map((a) => {
            if (a.kind === 'dismiss' || a.label.toLowerCase() === 'dismiss') {
              return (
                <button
                  key={a.id}
                  type="button"
                  className="link-dismiss"
                  onClick={onDismiss}
                >
                  {a.label}
                </button>
              )
            }
            return (
              <button
                key={a.id}
                type="button"
                className="btn-guide"
                onClick={onGuide}
              >
                {a.label}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
