const VIJIA_CAPTURE_DEBOUNCE_MS = 1200
const VIJIA_STABILITY_DELAY_MS = 1000
const VIJIA_STABILITY_ATTEMPTS = 5
/** Extra one-shot delays after load so we capture when the chat mounts late (SPA). */
const VIJIA_STARTUP_RETRY_DELAYS_MS = [2500, 6000, 12000]

let captureTimer = null
let lastSentHash = ''
/** Serialize runs so stability waits and delayed retries do not overlap. */
let emitChain = Promise.resolve()
let emptyPairRetries = 0
const VIJIA_EMPTY_PAIR_RETRY_MAX = 4

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

    // Do not overwrite a good snapshot with null (transient DOM / layout flicker).
    if (current) {
      previous = current
    }
    await sleep(VIJIA_STABILITY_DELAY_MS)
  }

  return previous
}

function enqueueEmitCapture(reason) {
  emitChain = emitChain
    .then(() => emitCapture(reason))
    .catch(() => {})
}

async function emitCapture(reason) {
  const adapter = VIJIA_SITE_ADAPTERS.detectAdapter()
  if (!adapter) {
    return
  }

  // Avoid posting while the tab is hidden so we do not send stale partial streams;
  // when the user returns, visibility listener schedules capture.
  if (document.visibilityState === 'hidden') {
    return
  }

  const pair = await waitForStableExtract(adapter)
  if (!pair || (!pair.user && !pair.assistant)) {
    if (emptyPairRetries < VIJIA_EMPTY_PAIR_RETRY_MAX) {
      emptyPairRetries += 1
      window.setTimeout(() => {
        enqueueEmitCapture(`retry-empty-${emptyPairRetries}`)
      }, 2200)
    }
    return
  }

  emptyPairRetries = 0

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

  sendCaptureToExtension({
    site: adapter.site,
    url: location.href,
    title: document.title,
    extract: pair,
    pageState: {
      streamStable: true,
      visibility: document.visibilityState
    },
    reason
  })
}

/**
 * After reload/update, the page's content script is disconnected; `sendMessage` may
 * reject a Promise even when a callback is used — catch both paths to avoid
 * "Extension context invalidated" uncaught rejections.
 */
function sendCaptureToExtension(payload) {
  if (!chrome.runtime?.id) {
    return
  }

  try {
    const maybePromise = chrome.runtime.sendMessage(
      {
        type: 'VIJIA_CAPTURE',
        payload
      },
      () => {
        void chrome.runtime.lastError
      }
    )
    if (maybePromise != null && typeof maybePromise.then === 'function') {
      maybePromise.catch(() => {})
    }
  } catch (_error) {
    // Sync throw when context is invalid (less common).
  }
}

function scheduleCapture(reason) {
  if (captureTimer !== null) {
    window.clearTimeout(captureTimer)
  }

  captureTimer = window.setTimeout(() => {
    captureTimer = null
    enqueueEmitCapture(reason)
  }, VIJIA_CAPTURE_DEBOUNCE_MS)
}

function installObservers() {
  const observer = new MutationObserver(() => {
    scheduleCapture('mutation')
  })

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
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
for (const delay of VIJIA_STARTUP_RETRY_DELAYS_MS) {
  window.setTimeout(() => enqueueEmitCapture(`startup-delay-${delay}`), delay)
}
