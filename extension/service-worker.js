const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:45731'
const DEFAULT_SETTINGS = {
  bridgeUrl: DEFAULT_BRIDGE_URL,
  sessionToken: ''
}

async function getSettings() {
  const result = await chrome.storage.local.get(DEFAULT_SETTINGS)
  return {
    bridgeUrl: result.bridgeUrl || DEFAULT_BRIDGE_URL,
    sessionToken: result.sessionToken || ''
  }
}

async function setBadge(text, color) {
  await chrome.action.setBadgeText({ text })
  await chrome.action.setBadgeBackgroundColor({ color })
}

async function postJson(url, body) {
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

  return {
    ok: response.ok,
    status: response.status,
    data
  }
}

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

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.set(DEFAULT_SETTINGS)
  void setBadge('SET', '#d97706')
})

chrome.runtime.onStartup.addListener(() => {
  void runHandshake()
})

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

    await setBadge(response.ok ? 'ON' : 'OFF', response.ok ? '#15803d' : '#b91c1c')
    sendResponse(response)
  })()

  return true
})
