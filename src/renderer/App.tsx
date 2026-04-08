import { useEffect, useState, type ReactElement } from 'react'
import type { TabKey } from '../shared/tab'
import { parseTabQuery } from '../shared/tab'
import { HomeTab } from '@renderer/tabs/HomeTab'
import { ContextTab } from '@renderer/tabs/ContextTab'
import { SubscriptionTab } from '@renderer/tabs/SubscriptionTab'
import { SettingsTab } from '@renderer/tabs/SettingsTab'

const TAB_LABELS: Record<TabKey, string> = {
  home: 'Home',
  context: 'Context',
  subscription: 'Subscription',
  settings: 'Settings'
}

const ORDER: TabKey[] = ['home', 'context', 'subscription', 'settings']

export function App(): ReactElement {
  const fromUrl = parseTabQuery(
    new URLSearchParams(window.location.search).get('tab')
  )
  const [activeTab, setActiveTab] = useState<TabKey>(fromUrl ?? 'home')

  useEffect(() => {
    const api = window.vijia
    if (!api) {
      console.warn('[Vijia] preload missing: window.vijia is undefined')
      return
    }
    const unsubOpen = api.onOpenWindow((payload) => {
      setActiveTab(payload.tab)
    })
    const unsubTray = api.onTrayAction(() => {
      /* Optional: reflect pause/resume in UI when product logic is added */
    })
    return () => {
      unsubOpen()
      unsubTray()
    }
  }, [])

  return (
    <div className="app">
      <nav className="tab-bar" role="tablist" aria-label="Main">
        {ORDER.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            className={`tab-bar__tab${activeTab === key ? ' tab-bar__tab--active' : ''}`}
            onClick={() => {
              setActiveTab(key)
            }}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </nav>
      <main className="tab-panel">
        {activeTab === 'home' && <HomeTab />}
        {activeTab === 'context' && <ContextTab />}
        {activeTab === 'subscription' && <SubscriptionTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </main>
    </div>
  )
}
