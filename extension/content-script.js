const VIJIA_CAPTURE_DEBOUNCE_MS = 1200
const VIJIA_STABILITY_DELAY_MS = 1000
const VIJIA_STABILITY_ATTEMPTS = 5

let captureTimer = null
let lastSentHash = ''

function buildHash(input) {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index)
    hash |= 0
  }
  return String(hash)
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitForStableExtract(adapter) {
  let previous = null

  for (let attempt = 0; attempt < VIJIA_STABILITY_ATTEMPTS; attempt += 1) {
    const current = adapter.extractLastPair()
    if (
      current &&
      previous &&
      current.user === previous.user &&
      current.assistant === previous.assistant
    ) {
      return current
    }

    previous = current
    await sleep(VIJIA_STABILITY_DELAY_MS)
  }

  return previous
}

async function emitCapture(reason) {
  const adapter = VIJIA_SITE_ADAPTERS.detectAdapter()
  if (!adapter || document.visibilityState === 'hidden') {
    return
  }

  const pair = await waitForStableExtract(adapter)
  if (!pair || (!pair.user && !pair.assistant)) {
    return
  }

  const hash = buildHash(
    JSON.stringify({
      site: adapter.site,
      title: document.title,
      pair
    })
  )

  if (hash === lastSentHash) {
    return
  }

  lastSentHash = hash

  chrome.runtime.sendMessage({
    type: 'VIJIA_CAPTURE',
    payload: {
      site: adapter.site,
      url: location.href,
      title: document.title,
      extract: pair,
      pageState: {
        streamStable: true,
        visibility: document.visibilityState
      },
      reason
    }
  })
}

function scheduleCapture(reason) {
  if (captureTimer !== null) {
    window.clearTimeout(captureTimer)
  }

  captureTimer = window.setTimeout(() => {
    void emitCapture(reason)
  }, VIJIA_CAPTURE_DEBOUNCE_MS)
}

function installObservers() {
  const observer = new MutationObserver(() => {
    scheduleCapture('mutation')
  })

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      scheduleCapture('visibility')
    }
  })

  window.addEventListener('focus', () => {
    scheduleCapture('focus')
  })
}

installObservers()
scheduleCapture('startup')
