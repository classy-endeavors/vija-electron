/**
 * Site detection for AI-chat browser windows.
 * Callers obtain the active window title (e.g. via node-active-window) and pass it here.
 */

/** `site` field in session-log notes when source is ai-chat */
export type AiChatSiteId =
  | 'chatgpt'
  | 'claude'
  | 'gemini'
  | 'perplexity'
  | 'deepseek'

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
