const VIJIA_SITE_ADAPTERS = (() => {
  function getPageText() {
    return document.body?.innerText?.trim() ?? ''
  }

  function splitBlocks(text) {
    return text
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
  }

  function findLastPairByMarkers(text, userMarkers, assistantMarkers) {
    const blocks = splitBlocks(text)
    let lastUser = ''
    let lastAssistant = ''

    for (const block of blocks) {
      const isUser = userMarkers.some((marker) => block.startsWith(marker))
      const isAssistant = assistantMarkers.some((marker) =>
        block.startsWith(marker)
      )

      if (isUser) {
        lastUser = block
      } else if (isAssistant) {
        lastAssistant = block
      }
    }

    if (!lastUser || !lastAssistant) {
      return null
    }

    return {
      user: lastUser,
      assistant: lastAssistant
    }
  }

  function fallbackLastPair() {
    const blocks = splitBlocks(getPageText())
    if (blocks.length < 2) {
      return null
    }

    return {
      user: blocks[Math.max(0, blocks.length - 2)],
      assistant: blocks[blocks.length - 1]
    }
  }

  function stableExtract(userMarkers, assistantMarkers) {
    const text = getPageText()
    return (
      findLastPairByMarkers(text, userMarkers, assistantMarkers) ?? fallbackLastPair()
    )
  }

  /** ChatGPT / ChatGPT Enterprise render turns with explicit roles (not body innerText). */
  function isChatGptAssistantNoise(text) {
    const t = text.trim().toLowerCase()
    if (t.length < 500 && /cookie preference|privacy policy|terms of use/.test(t)) {
      return true
    }
    if (
      /^chatgpt can make mistakes/i.test(text.trim()) ||
      /check important info/i.test(t)
    ) {
      return true
    }
    if (t === 'chatgpt' || t === 'you' || t.length < 3) {
      return true
    }
    return false
  }

  function normalizeMessageText(text) {
    return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
  }

  /**
   * Picks the message body inside a [data-message-author-role] node.
   * chatgpt.com (2025+): user text lives under .user-message-bubble-color (often .whitespace-pre-wrap);
   * assistant uses div.markdown / .prose (no [data-message-content] in the common layout).
   */
  function getChatGptTextForRoleNode(turn) {
    const role = turn.getAttribute('data-message-author-role')
    if (role === 'user') {
      const legacy = turn.querySelector('[data-message-content]')
      if (legacy) {
        const t = normalizeMessageText(legacy.innerText ?? '')
        if (t) {
          return t
        }
      }
      const bubble =
        turn.querySelector('.user-message-bubble-color') ||
        turn.querySelector('[class*="user-message-bubble"]')
      if (bubble) {
        const pre =
          bubble.querySelector(
            '.whitespace-pre-wrap, [class*="whitespace-pre-wrap"]'
          ) || bubble
        const t = normalizeMessageText(pre.innerText ?? '')
        if (t) {
          return t
        }
      }
      return normalizeMessageText(turn.innerText ?? '')
    }
    if (role === 'assistant') {
      const fromData = turn.querySelector('[data-message-content]')
      if (fromData) {
        const t = normalizeMessageText(fromData.innerText ?? '')
        if (t) {
          return t
        }
      }
      const md =
        turn.querySelector('div.markdown, .markdown.prose, .markdown') ||
        turn.querySelector('[class*="markdown"]')
      if (md) {
        return normalizeMessageText(md.innerText ?? '')
      }
      return normalizeMessageText(turn.innerText ?? '')
    }
    return ''
  }

  function buildChatGptLastPairFromTurns(turnEls) {
    let lastUser = ''
    const assistantTexts = []

    turnEls.forEach((turn) => {
      const role = turn.getAttribute('data-message-author-role')
      const raw = getChatGptTextForRoleNode(turn)
      if (!raw) {
        return
      }

      if (role === 'user') {
        lastUser = raw
      } else if (role === 'assistant') {
        assistantTexts.push(raw)
      }
    })

    let lastAssistant = ''
    for (let i = assistantTexts.length - 1; i >= 0; i -= 1) {
      const candidate = assistantTexts[i]
      if (!isChatGptAssistantNoise(candidate)) {
        lastAssistant = candidate
        break
      }
    }

    if (!lastAssistant && assistantTexts.length) {
      lastAssistant = assistantTexts.reduce((best, cur) =>
        cur.length > best.length ? cur : best
      )
    }

    if (lastAssistant && isChatGptAssistantNoise(lastAssistant)) {
      lastAssistant = ''
    }

    if (!lastUser && !lastAssistant) {
      return null
    }

    return { user: lastUser, assistant: lastAssistant }
  }

  /** Prefers 2024+ thread layout: one <section data-testid="conversation-turn-…"> per turn. */
  function extractChatGptByConversationTurns() {
    const sections = document.querySelectorAll(
      'section[data-testid^="conversation-turn-"]'
    )
    if (!sections.length) {
      return null
    }
    const turnEls = []
    for (const section of sections) {
      const el = section.querySelector('[data-message-author-role]')
      if (el) {
        turnEls.push(el)
      }
    }
    if (!turnEls.length) {
      return null
    }
    return buildChatGptLastPairFromTurns(turnEls)
  }

  /**
   * Fallback: walk all role nodes in document order (older layouts, tools UIs, iframes absent).
   */
  function extractChatGptByAuthorRoleNodes() {
    const turnRoots = document.querySelectorAll('[data-message-author-role]')
    if (!turnRoots.length) {
      return null
    }
    return buildChatGptLastPairFromTurns(turnRoots)
  }

  function extractChatGptLastPair() {
    return (
      extractChatGptByConversationTurns() ??
      extractChatGptByAuthorRoleNodes() ??
      extractChatGptHeuristicPlaintext() ??
      stableExtract(['You', 'User'], ['ChatGPT', 'Assistant'])
    )
  }

  /**
   * When role-based DOM selectors break (layout experiments), fall back to the main
   * column's plain text — last two paragraph-sized blocks are usually user + assistant.
   */
  function extractChatGptHeuristicPlaintext() {
    const main =
      document.querySelector('main') ||
      document.querySelector('[class*="conversation"]') ||
      document.body
    const text = normalizeMessageText(main?.innerText ?? '')
    if (text.length < 30) {
      return null
    }

    const parts = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)

    if (parts.length < 2) {
      return null
    }

    let assistant = parts[parts.length - 1]
    let user = parts[parts.length - 2]

    while (parts.length >= 2 && isChatGptAssistantNoise(assistant)) {
      parts.pop()
      assistant = parts[parts.length - 1]
      user = parts[parts.length - 2]
    }

    if (!user || !assistant || assistant.length < 4) {
      return null
    }

    return { user, assistant }
  }

  /**
   * gemini.google.com (2025+): Angular custom elements in #chat-history —
   * user-query + model-response; assistant body in .markdown-main-panel.
   */
  function isGeminiAssistantNoise(text) {
    const t = text.trim().toLowerCase()
    if (t.length < 3) {
      return true
    }
    if (t.length < 120 && /gemini is ai|can make mistakes/.test(t)) {
      return true
    }
    if (t === 'gemini' || t === 'you said' || t === 'gemini said') {
      return true
    }
    return false
  }

  function getGeminiChatRoot() {
    return (
      document.querySelector('[data-test-id="chat-history-container"]') ||
      document.getElementById('chat-history')
    )
  }

  function getGeminiUserTextFromUserQuery(uq) {
    const line = uq.querySelector('p.query-text-line')
    if (line) {
      return normalizeMessageText(line.innerText ?? '')
    }
    const bubble = uq.querySelector('.user-query-bubble-with-background .query-text')
    if (bubble) {
      return normalizeMessageText(bubble.innerText ?? '')
    }
    const qt = uq.querySelector('.query-text')
    if (qt) {
      return normalizeMessageText(qt.innerText ?? '')
    }
    return normalizeMessageText(uq.innerText ?? '')
  }

  function getGeminiAssistantTextFromModelResponse(mr) {
    const panels = mr.querySelectorAll(
      'div.markdown.markdown-main-panel, .markdown-main-panel, [id^="model-response-message-content"]'
    )
    if (!panels.length) {
      const sc = mr.querySelector('structured-content-container .markdown, message-content .markdown')
      if (sc) {
        return normalizeMessageText(sc.innerText ?? '')
      }
      return ''
    }
    const last = panels[panels.length - 1]
    return normalizeMessageText(last.innerText ?? '')
  }

  function extractGeminiFromDom() {
    const root = getGeminiChatRoot()
    if (!root) {
      return null
    }

    const userEls = root.querySelectorAll('user-query')
    const modelEls = root.querySelectorAll('model-response')

    let lastUser = ''
    if (userEls.length) {
      lastUser = getGeminiUserTextFromUserQuery(
        userEls[userEls.length - 1]
      )
    }

    const assistantChunks = []
    for (const mr of modelEls) {
      const t = getGeminiAssistantTextFromModelResponse(mr)
      if (t) {
        assistantChunks.push(t)
      }
    }

    let lastAssistant = ''
    for (let i = assistantChunks.length - 1; i >= 0; i -= 1) {
      const c = assistantChunks[i]
      if (c && !isGeminiAssistantNoise(c)) {
        lastAssistant = c
        break
      }
    }
    if (!lastAssistant && assistantChunks.length) {
      lastAssistant = assistantChunks[assistantChunks.length - 1]
    }
    if (lastAssistant && isGeminiAssistantNoise(lastAssistant)) {
      lastAssistant = ''
    }

    if (!lastUser && !lastAssistant) {
      return null
    }
    return { user: lastUser, assistant: lastAssistant }
  }

  /**
   * claude.ai: user bubbles + Claude markdown (no body-text fallbacks).
   * Assistant: .standard-markdown / .progressive-markdown under .font-claude-response
   * (omits tool strips like "Searched the web" above the main grid cell).
   */
  function isClaudeAssistantNoise(text) {
    const t = text.trim().toLowerCase()
    if (t.length < 3) {
      return true
    }
    if (
      t.length < 200 &&
      /claude is ai|can make mistakes|double-check cited|please double-check/.test(t)
    ) {
      return true
    }
    if (t === 'claude' || t === 'claude said') {
      return true
    }
    return false
  }

  function extractClaudeUserFromDom() {
    const bubbles = document.querySelectorAll('[data-user-message-bubble="true"]')
    if (!bubbles.length) {
      return ''
    }
    const b = bubbles[bubbles.length - 1]
    const fromTestId = b.querySelector('[data-testid="user-message"]')
    if (fromTestId) {
      return normalizeMessageText(fromTestId.innerText ?? '')
    }
    const pre = b.querySelector('p.whitespace-pre-wrap, .whitespace-pre-wrap')
    if (pre) {
      return normalizeMessageText(pre.innerText ?? '')
    }
    return normalizeMessageText(b.innerText ?? '')
  }

  function extractClaudeAssistantFromDom() {
    const panels = document.querySelectorAll(
      '.font-claude-response .standard-markdown, .font-claude-response .progressive-markdown'
    )
    if (!panels.length) {
      return ''
    }
    const last = panels[panels.length - 1]
    const t = normalizeMessageText(last.innerText ?? '')
    if (t && isClaudeAssistantNoise(t)) {
      return ''
    }
    return t
  }

  function extractClaudeFromDom() {
    const user = extractClaudeUserFromDom()
    const assistant = extractClaudeAssistantFromDom()
    if (!user && !assistant) {
      return null
    }
    return { user, assistant }
  }

  /**
   * perplexity.ai: user bubble in h1.group/query; answer in #markdown-content-N.
   * No body / marker fallbacks.
   */
  function isPerplexityAssistantNoise(text) {
    const t = text.trim().toLowerCase()
    if (t.length < 3) {
      return true
    }
    if (
      t.length < 200 &&
      /perplexity is ai|viewing a shared thread|ask a follow-up/.test(t)
    ) {
      return true
    }
    return false
  }

  function extractPerplexityUserFromDom() {
    const heads = document.querySelectorAll('h1[class*="group/query"]')
    if (!heads.length) {
      return ''
    }
    const h = heads[heads.length - 1]
    const inBubble = h.querySelector(
      '[class*="bg-subtle"] span.min-w-0, .bg-subtle span, [class*="rounded-2xl"] span'
    )
    if (inBubble) {
      return normalizeMessageText(inBubble.innerText ?? '')
    }
    return normalizeMessageText(h.innerText ?? '')
  }

  function extractPerplexityAssistantFromDom() {
    const blocks = document.querySelectorAll('[id^="markdown-content-"]')
    if (!blocks.length) {
      return ''
    }
    const el = blocks[blocks.length - 1]
    let t = normalizeMessageText(el.innerText ?? '')
    if (t && isPerplexityAssistantNoise(t)) {
      t = ''
    }
    return t
  }

  function extractPerplexityFromDom() {
    const user = extractPerplexityUserFromDom()
    const assistant = extractPerplexityAssistantFromDom()
    if (!user && !assistant) {
      return null
    }
    return { user, assistant }
  }

  const adapters = [
    {
      site: 'chatgpt',
      matches() {
        return (
          location.hostname === 'chatgpt.com' ||
          location.hostname === 'chat.openai.com'
        )
      },
      extractLastPair() {
        return extractChatGptLastPair()
      }
    },
    {
      site: 'claude',
      matches() {
        return location.hostname === 'claude.ai'
      },
      extractLastPair() {
        return extractClaudeFromDom()
      }
    },
    {
      site: 'gemini',
      matches() {
        return location.hostname === 'gemini.google.com'
      },
      extractLastPair() {
        return extractGeminiFromDom()
      }
    },
    {
      site: 'perplexity',
      matches() {
        return (
          location.hostname === 'www.perplexity.ai' ||
          location.hostname === 'perplexity.ai'
        )
      },
      extractLastPair() {
        return extractPerplexityFromDom()
      }
    },
    {
      site: 'deepseek',
      matches() {
        return location.hostname === 'chat.deepseek.com'
      },
      extractLastPair() {
        return stableExtract(['You'], ['DeepSeek'])
      }
    }
  ]

  function detectAdapter() {
    return adapters.find((adapter) => adapter.matches()) ?? null
  }

  return {
    detectAdapter
  }
})()
