import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getVijiaDataDir } from './vijiaStorage'
import type { ProactiveSuggestionType } from '../shared/proactive'

const HISTORY_CAP = 50
const MULTIPLIER_CAP = 8

export type SuggestionOutcomeKind = 'shown' | 'accepted' | 'dismissed'

export type SuggestionHistoryEntry = {
  at: string
  notificationId: string
  sessionNoteId: string
  outcome: SuggestionOutcomeKind
  suggestionType?: ProactiveSuggestionType
}

export type SuggestionStats = {
  totalShown: number
  totalAccepted: number
  totalDismissed: number
  consecutiveDismissals: number
  /** 1, 2, 4, 8 — doubles every 3 consecutive dismissals, capped at 8; resets to 1 on accept */
  cooldownMultiplier: number
  /** For gating proactive suggestions (not the overlay NotificationManager math) */
  lastProactiveShownAt: number | null
  history: SuggestionHistoryEntry[]
}

export type UserBehaviorFile = {
  suggestion_stats: SuggestionStats
  skillLevel?: string
  tonePreferences?: Record<string, unknown>
  [key: string]: unknown
}

function defaultSuggestionStats(): SuggestionStats {
  return {
    totalShown: 0,
    totalAccepted: 0,
    totalDismissed: 0,
    consecutiveDismissals: 0,
    cooldownMultiplier: 1,
    lastProactiveShownAt: null,
    history: []
  }
}

function getUserBehaviorPath(): string {
  return path.join(getVijiaDataDir(), 'user-behavior.json')
}

async function atomicWriteJson(targetPath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true })
  const dir = path.dirname(targetPath)
  const tmp = path.join(dir, `.tmp-ub-${randomUUID()}.json`)
  const text = JSON.stringify(data, null, 2)
  await writeFile(tmp, text, 'utf8')
  try {
    await rename(tmp, targetPath)
  } catch {
    await writeFile(targetPath, text, 'utf8')
  }
}

/**
 * Read full user profile. Missing file returns a baseline object.
 */
export async function readUserBehavior(): Promise<UserBehaviorFile> {
  const target = getUserBehaviorPath()
  try {
    const raw = await readFile(target, 'utf8')
    const parsed = JSON.parse(raw) as UserBehaviorFile
    if (!parsed.suggestion_stats) {
      parsed.suggestion_stats = defaultSuggestionStats()
    }
    return mergeStatsDefaults(parsed)
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? (error as NodeJS.ErrnoException).code
        : undefined
    if (code === 'ENOENT') {
      return {
        suggestion_stats: defaultSuggestionStats()
      }
    }
    throw error
  }
}

function mergeStatsDefaults(data: UserBehaviorFile): UserBehaviorFile {
  const d = defaultSuggestionStats()
  const s = data.suggestion_stats
  return {
    ...data,
    suggestion_stats: {
      totalShown: s.totalShown ?? d.totalShown,
      totalAccepted: s.totalAccepted ?? d.totalAccepted,
      totalDismissed: s.totalDismissed ?? d.totalDismissed,
      consecutiveDismissals: s.consecutiveDismissals ?? d.consecutiveDismissals,
      cooldownMultiplier: clampMultiplier(s.cooldownMultiplier ?? d.cooldownMultiplier),
      lastProactiveShownAt:
        s.lastProactiveShownAt === undefined ? d.lastProactiveShownAt : s.lastProactiveShownAt,
      history: Array.isArray(s.history) ? s.history.slice(-HISTORY_CAP) : []
    }
  }
}

function clampMultiplier(n: number): number {
  if (!Number.isFinite(n) || n < 1) {
    return 1
  }
  return Math.min(MULTIPLIER_CAP, Math.max(1, n))
}

/**
 * M3: only `suggestion_stats` is mutated; everything else is copied from disk as-is.
 */
export async function writeUserBehavior(data: UserBehaviorFile): Promise<void> {
  await atomicWriteJson(getUserBehaviorPath(), data)
}

function pushHistory(stats: SuggestionStats, entry: SuggestionHistoryEntry): void {
  stats.history.push(entry)
  if (stats.history.length > HISTORY_CAP) {
    stats.history = stats.history.slice(-HISTORY_CAP)
  }
}

export async function recordProactiveNotificationShown(params: {
  notificationId: string
  sessionNoteId: string
  suggestionType: ProactiveSuggestionType
}): Promise<void> {
  const data = await readUserBehavior()
  const stats = data.suggestion_stats
  stats.totalShown += 1
  stats.lastProactiveShownAt = Date.now()
  pushHistory(stats, {
    at: new Date().toISOString(),
    notificationId: params.notificationId,
    sessionNoteId: params.sessionNoteId,
    outcome: 'shown',
    suggestionType: params.suggestionType
  })

  const next: UserBehaviorFile = { ...data, suggestion_stats: stats }
  await writeUserBehavior(next)
}

export async function recordProactiveOutcome(params: {
  notificationId: string
  sessionNoteId: string
  outcome: 'accepted' | 'dismissed'
  suggestionType?: ProactiveSuggestionType
}): Promise<void> {
  const data = await readUserBehavior()
  const stats = data.suggestion_stats

  if (params.outcome === 'accepted') {
    stats.totalAccepted += 1
    stats.consecutiveDismissals = 0
    stats.cooldownMultiplier = 1
  } else {
    stats.totalDismissed += 1
    stats.consecutiveDismissals += 1
    if (stats.consecutiveDismissals >= 3) {
      stats.cooldownMultiplier = clampMultiplier(
        Math.min(MULTIPLIER_CAP, stats.cooldownMultiplier * 2)
      )
      stats.consecutiveDismissals = 0
    }
  }

  pushHistory(stats, {
    at: new Date().toISOString(),
    notificationId: params.notificationId,
    sessionNoteId: params.sessionNoteId,
    outcome: params.outcome,
    suggestionType: params.suggestionType
  })

  const next: UserBehaviorFile = { ...data, suggestion_stats: stats }
  await writeUserBehavior(next)
}

export function getEffectiveM3ProactiveCooldownMs(
  baseCooldownMs: number,
  stats: SuggestionStats
): number {
  return baseCooldownMs * clampMultiplier(stats.cooldownMultiplier)
}
