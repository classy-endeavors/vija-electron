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
        return stableExtract(['You', 'User'], ['ChatGPT', 'Assistant'])
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
        return location.hostname === 'www.perplexity.ai'
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
