const RELOAD_MENU_ID = 'vijia-reload-extension'

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:45731'
const DEFAULT_SETTINGS = {
  bridgeUrl: DEFAULT_BRIDGE_URL,
  sessionToken: '',
  debugOverlay: false
}

async function getSettings() {
  const result = await chrome.storage.local.get(DEFAULT_SETTINGS)
  let bridgeUrl = result.bridgeUrl || DEFAULT_BRIDGE_URL
  let sessionToken = result.sessionToken || ''
  if (!sessionToken) {
    try {
      const base = bridgeUrl.replace(/\/$/, '')
      const response = await fetch(`${base}/extension/bootstrap`)
      if (response.ok) {
        const data = await response.json()
        const t =
          data && typeof data.sessionToken === 'string'
            ? data.sessionToken.trim()
            : ''
        if (t) {
          sessionToken = t
          if (data && typeof data.bridgeUrl === 'string' && data.bridgeUrl.trim()) {
            bridgeUrl = data.bridgeUrl.trim()
          }
          await chrome.storage.local.set({ bridgeUrl, sessionToken })
        }
      }
    } catch {
      // App not running or port mismatch — user can paste token in options.
    }
  }
  return { bridgeUrl, sessionToken }
}

async function setBadge(text, color) {
  await chrome.action.setBadgeText({ text })
  await chrome.action.setBadgeBackgroundColor({ color })
}

async function postJson(url, body, options = {}) {
  const retries = options.retries ?? 2
  const maxAttempts = retries + 1

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })

      let data = {}
      try {
        data = await response.json()
      } catch (_error) {
        data = {}
      }

      const result = {
        ok: response.ok,
        status: response.status,
        data
      }

      if (response.ok) {
        return result
      }

      if (response.status < 500) {
        return result
      }
    } catch (_error) {
      if (attempt === maxAttempts - 1) {
        return { ok: false, status: 0, data: {} }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)))
  }

  return { ok: false, status: 0, data: {} }
}

function registerReloadContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: RELOAD_MENU_ID,
      title: 'Reload extension',
      contexts: ['action']
    })
  })
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === RELOAD_MENU_ID) {
    chrome.runtime.reload()
  }
})

registerReloadContextMenu()

const VIJIA_HOST_RE =
  /^https:\/\/(chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com|www\.perplexity\.ai|perplexity\.ai|chat\.deepseek\.com)\//u

chrome.tabs.onActivated.addListener((activeInfo) => {
  void (async () => {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId)
      const url = tab.url || ''
      if (!VIJIA_HOST_RE.test(url)) {
        return
      }
      await chrome.tabs.sendMessage(activeInfo.tabId, {
        type: 'VIJIA_SCHEDULE_CAPTURE',
        reason: 'tab-switch'
      })
    } catch {
      // Tab may not have content script yet.
    }
  })()
})

async function runHandshake() {
  const settings = await getSettings()
  if (!settings.sessionToken) {
    await setBadge('SET', '#d97706')
    return
  }

  const response = await postJson(`${settings.bridgeUrl}/extension/handshake`, {
    token: settings.sessionToken,
    extensionVersion: chrome.runtime.getManifest().version
  })

  await setBadge(response.ok ? 'ON' : 'OFF', response.ok ? '#15803d' : '#b91c1c')
}

function buildCapturePayload(message, sender, sessionToken) {
  return {
    schema: 1,
    sessionToken,
    eventId: crypto.randomUUID(),
    capturedAt: new Date().toISOString(),
    site: message.payload.site,
    url: message.payload.url,
    title: message.payload.title,
    tabId: sender.tab?.id ?? -1,
    frameId: sender.frameId ?? 0,
    source: 'browser-extension',
    extract: message.payload.extract,
    pageState: message.payload.pageState
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  registerReloadContextMenu()
  if (details.reason === 'install') {
    void chrome.storage.local.set(DEFAULT_SETTINGS)
    void setBadge('SET', '#d97706')
  }
  // Fires on first install, unpacked reload (usually `update`), and extension updates.
  void runHandshake()
})

chrome.runtime.onStartup.addListener(() => {
  void runHandshake()
})

// Service worker startup (including after `chrome.runtime.reload()` from the context menu).
void runHandshake()

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'VIJIA_CAPTURE') {
    return false
  }

  void (async () => {
    const settings = await getSettings()

    if (!settings.sessionToken) {
      await setBadge('SET', '#d97706')
      sendResponse({ ok: false, error: 'missing-token' })
      return
    }

    const payload = buildCapturePayload(message, sender, settings.sessionToken)
    const response = await postJson(
      `${settings.bridgeUrl}/extension/capture`,
      payload
    )

    if (!response.ok) {
      console.warn(
        '[Vijia] Capture POST failed:',
        response.status,
        settings.bridgeUrl
      )
    }

    await setBadge(response.ok ? 'ON' : 'OFF', response.ok ? '#15803d' : '#b91c1c')
    sendResponse(response)
  })()

  return true
})
