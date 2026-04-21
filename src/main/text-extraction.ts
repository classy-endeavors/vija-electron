/**
 * Site detection and text extraction for AI-chat browser windows.
 * Callers obtain the active window title (e.g. via node-active-window) and pass it here.
 * For DOM reads, inject `getInnerText` (e.g. `() => webContents.executeJavaScript('document.body.innerText')`).
 */

import { createHash } from 'node:crypto'
import type {
  BrowserExtensionCaptureExtract,
  BrowserExtensionCaptureRequest
} from '../shared/browserBridge'

const STREAM_POLL_MS = 1000
const STREAM_TIMEOUT_MS = 20_000

const USER_LIMIT = 4 * 1024
const ASSISTANT_LIMIT = 12 * 1024

/** `site` field in session-log notes when source is ai-chat */
export type AiChatSiteId =
  | 'chatgpt'
  | 'claude'
  | 'gemini'
  | 'perplexity'
  | 'deepseek'

/** When `detectSite` is null, use desktopCapturer instead of innerText extraction. */
export const FALLBACK_DESKTOP_CAPTURE_INSTRUCTION =
  'Not a detected AI-chat window. Use the existing Electron desktopCapturer flow: getSources (e.g. window/screen), pick the target source, and capture via the screenshot pipeline instead of text extraction.'

export function getNonAiChatCaptureInstruction(): string {
  return FALLBACK_DESKTOP_CAPTURE_INSTRUCTION
}

/** True when the focused window is Vijia — skip all capture (no extract, no screenshot). */
export function isVijiaActiveWindow(windowTitle: string): boolean {
  return windowTitle.trim().toLowerCase().includes('vijia')
}

/**
 * Maps a window title to a known AI chat site, or null for screenshot / non-ai-chat fallback.
 * Does not check {@link isVijiaActiveWindow}; callers must short-circuit on self first.
 */
export function detectSite(windowTitle: string): AiChatSiteId | null {
  if (windowTitle.includes('ChatGPT')) {
    return 'chatgpt'
  }
  if (
    windowTitle.includes('Claude') &&
    windowTitle.toLowerCase().includes('claude.ai')
  ) {
    return 'claude'
  }
  if (windowTitle.includes('Gemini') && windowTitle.includes('Google')) {
    return 'gemini'
  }
  if (windowTitle.includes('Perplexity')) {
    return 'perplexity'
  }
  if (windowTitle.includes('DeepSeek')) {
    return 'deepseek'
  }
  return null
}

export type StreamingStableOk = { ok: true; text: string }
export type StreamingStableTimeout = { ok: false; reason: 'timeout' }
export type StreamingStableResult = StreamingStableOk | StreamingStableTimeout

/**
 * Polls `document.body`-equivalent text until two consecutive samples match (1s apart) or 20s elapses.
 * Pass `getInnerText` from main, e.g. `() => webContents.executeJavaScript('document.body.innerText')`.
 * Matches PRD: t0 → wait 1s → t1; if unequal, wait 1s and repeat.
 */
export async function streamingStable(
  getInnerText: () => Promise<string>,
  options?: { pollMs?: number; timeoutMs?: number }
): Promise<StreamingStableResult> {
  const pollMs = options?.pollMs ?? STREAM_POLL_MS
  const timeoutMs = options?.timeoutMs ?? STREAM_TIMEOUT_MS
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    const t0 = await getInnerText()
    await sleep(pollMs)
    const t1 = await getInnerText()
    if (t0 === t1) {
      return { ok: true, text: t1 }
    }
    await sleep(pollMs)
  }

  console.warn('stream timeout')
  return { ok: false, reason: 'timeout' }
}

export type MessagePair = { user: string; assistant: string }

/**
 * After stream-stable text is available, take the last user + assistant messages using site-specific heuristics on plain text.
 */
export function extractLastPair(site: AiChatSiteId, text: string): MessagePair {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return { user: '', assistant: '' }
  }

  const blocks = splitMessageBlocks(site, normalized)
  if (blocks.length >= 2) {
    const user = blocks[blocks.length - 2]!
    let assistant = blocks[blocks.length - 1]!
    if (site === 'perplexity') {
      assistant = stripPerplexitySources(assistant)
    }
    return { user, assistant }
  }

  const single = blocks[0] ?? normalized
  const roleSplit = trySplitByRoleMarkers(site, single)
  if (roleSplit) {
    return {
      user: roleSplit.user,
      assistant:
        site === 'perplexity'
          ? stripPerplexitySources(roleSplit.assistant)
          : roleSplit.assistant
    }
  }
  const assistant =
    site === 'perplexity' ? stripPerplexitySources(single) : single
  return { user: '', assistant }
}

/**
 * Remove likely secrets before text leaves the machine (emails, common API key shapes, phone-like numbers).
 */
export function scrubSecrets(text: string): string {
  if (!text) {
    return text
  }
  let out = text

  out = out.replace(/\bAKIA[0-9A-Z]{16}\b/g, '[redacted]')
  out = out.replace(/\bASIA[0-9A-Z]{16}\b/g, '[redacted]')
  out = out.replace(/\bghp_[a-zA-Z0-9]{36}\b/gi, '[redacted]')
  out = out.replace(/\bgho_[a-zA-Z0-9]{36}\b/gi, '[redacted]')
  out = out.replace(/\bghu_[a-zA-Z0-9]{36}\b/gi, '[redacted]')
  out = out.replace(/\bghs_[a-zA-Z0-9]{36}\b/gi, '[redacted]')
  out = out.replace(/\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g, '[redacted]')
  out = out.replace(
    /\b(?:sk|pk)-(?:live|test|proj)-[a-zA-Z0-9]{20,}\b/g,
    '[redacted]'
  )
  out = out.replace(/\bsk-[a-zA-Z0-9]{20,}\b/g, '[redacted]')

  out = out.replace(
    /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    '[redacted]'
  )

  out = out.replace(
    /\b(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    '[redacted]'
  )
  out = out.replace(
    /\b\+?\d{1,3}[-.\s]\d{2,4}[-.\s]\d{2,4}[-.\s]\d{2,4}\b/g,
    '[redacted]'
  )

  return out
}

export function scrubMessagePair(pair: MessagePair): MessagePair {
  return {
    user: scrubSecrets(pair.user),
    assistant: scrubSecrets(pair.assistant)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/** Paragraph-style blocks; delimiter heuristics vary by site (plain innerText). */
function splitMessageBlocks(site: AiChatSiteId, text: string): string[] {
  let t = text
  if (site === 'perplexity') {
    t = t.replace(/\nSources\b[\s\S]*$/iu, '').trim()
  }

  const rough = t
    .split(/\n{2,}/u)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)

  if (site === 'gemini' && rough.length < 2) {
    const alt = t.split(/\n{3,}/u).map((b) => b.trim()).filter((b) => b.length > 0)
    if (alt.length >= 2) {
      return alt
    }
  }

  return rough.length > 0 ? rough : [text]
}

function stripPerplexitySources(block: string): string {
  const idx = block.search(/\nSources\b/i)
  if (idx === -1) {
    return block
  }
  return block.slice(0, idx).trim()
}

function trySplitByRoleMarkers(
  site: AiChatSiteId,
  text: string
): MessagePair | null {
  const bySite: Record<AiChatSiteId, RegExp> = {
    chatgpt: /\n\s*ChatGPT\s*\n/i,
    claude: /\n\s*Claude\s*\n/i,
    gemini: /\n\s*Gemini\s*\n/i,
    perplexity: /\n\s*Perplexity\s*\n/i,
    deepseek: /\n\s*DeepSeek\s*\n/i
  }

  const primary = bySite[site].exec(text)
  if (primary?.index !== undefined) {
    const user = text.slice(0, primary.index).trim()
    const assistant = text.slice(primary.index + primary[0].length).trim()
    if (user.length > 0 && assistant.length > 0) {
      return { user, assistant }
    }
  }

  const fallback = /\n\s*(?:ChatGPT|Claude|Gemini|DeepSeek|Perplexity)\s*\n/i
  const m = fallback.exec(text)
  if (m?.index !== undefined) {
    const user = text.slice(0, m.index).trim()
    const assistant = text.slice(m.index + m[0].length).trim()
    if (user.length > 0 && assistant.length > 0) {
      return { user, assistant }
    }
  }

  const youLine = /\nYou\s*\n/i
  const ym = youLine.exec(text)
  if (ym?.index !== undefined && ym.index > 0) {
    const before = text.slice(0, ym.index).trim()
    const after = text.slice(ym.index + ym[0].length).trim()
    if (before.length > 0 && after.length > 0) {
      return { user: before, assistant: after }
    }
  }

  return null
}

function truncateMiddle(input: string, limit: number): string {
  if (input.length <= limit) {
    return input
  }

  const marker = '\n[truncated]\n'
  const remaining = Math.max(limit - marker.length, 0)
  const head = Math.ceil(remaining / 2)
  const tail = Math.floor(remaining / 2)
  return `${input.slice(0, head)}${marker}${input.slice(input.length - tail)}`
}

export function normalizeBrowserExtract(
  extract: BrowserExtensionCaptureExtract
): BrowserExtensionCaptureExtract {
  return {
    user: truncateMiddle(scrubSecrets(extract.user.trim()), USER_LIMIT),
    assistant: truncateMiddle(
      scrubSecrets(extract.assistant.trim()),
      ASSISTANT_LIMIT
    )
  }
}

export function buildBrowserCaptureDedupeKey(
  payload: BrowserExtensionCaptureRequest
): string {
  const normalized = normalizeBrowserExtract(payload.extract)
  return createHash('sha256')
    .update(
      JSON.stringify({
        site: payload.site,
        title: payload.title,
        user: normalized.user,
        assistant: normalized.assistant
      })
    )
    .digest('hex')
}
