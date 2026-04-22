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
   * Reads the latest user + assistant bubbles from the conversation column.
   * Matches multiple ChatGPT DOM variants used on chatgpt.com (see public exporter patterns).
   */
  function extractChatGptConversationPair() {
    const turnRoots = document.querySelectorAll('[data-message-author-role]')
    if (!turnRoots.length) {
      return null
    }

    let lastUser = ''
    const assistantTexts = []

    turnRoots.forEach((turn) => {
      const role = turn.getAttribute('data-message-author-role')
      const contentRoot =
        turn.querySelector('[data-message-content]') ||
        turn.querySelector('[class*="markdown"]') ||
        turn

      let raw = contentRoot.innerText ?? ''
      raw = normalizeMessageText(raw)
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
        return (
          extractChatGptConversationPair() ??
          extractChatGptHeuristicPlaintext() ??
          stableExtract(['You', 'User'], ['ChatGPT', 'Assistant'])
        )
      }
    },
    {
      site: 'claude',
      matches() {
        return location.hostname === 'claude.ai'
      },
      extractLastPair() {
        return stableExtract(['You', 'Human'], ['Claude', 'Assistant'])
      }
    },
    {
      site: 'gemini',
      matches() {
        return location.hostname === 'gemini.google.com'
      },
      extractLastPair() {
        return stableExtract(['You'], ['Gemini'])
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
        return stableExtract(['You'], ['Perplexity'])
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
