export type TabKey = 'home' | 'context' | 'subscription' | 'settings'

export const TAB_KEYS: readonly TabKey[] = [
  'home',
  'context',
  'subscription',
  'settings'
] as const

export function parseTabQuery(value: string | null): TabKey | undefined {
  if (!value) return undefined
  const v = value.toLowerCase()
  if ((TAB_KEYS as readonly string[]).includes(v)) {
    return v as TabKey
  }
  return undefined
}
