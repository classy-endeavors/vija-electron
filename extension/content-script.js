/** M3: 10s global debounce across all capture reasons. */
const VIJIA_CAPTURE_DEBOUNCE_MS = 10_000
const VIJIA_STABILITY_DELAY_MS = 1000
const VIJIA_STABILITY_ATTEMPTS = 5
/** Extra one-shot delays after load so we capture when the chat mounts late (SPA). */
const VIJIA_STARTUP_RETRY_DELAYS_MS = [2500, 6000, 12000]
const VIJIA_TYPING_STOP_IDLE_MS = 800
const VIJIA_SCROLL_END_MS = 400
const VIJIA_DOM_IDLE_MS = 1500

let captureTimer = null
let lastSentHash = ''
/** Serialize runs so stability waits and delayed retries do not overlap. */
let emitChain = Promise.resolve()
let emptyPairRetries = 0
const VIJIA_EMPTY_PAIR_RETRY_MAX = 4

let typingStopTimer = null
let scrollStopTimer = null
let domIdleTimer = null

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
  } catch (_error) {}
}

/**
 * Global 10s debounce for every milestone reason.
 * @param {string} reason app-switch | tab-switch | typing-stop | scroll-pause | typing-start
 */
function scheduleCapture(reason) {
  if (captureTimer !== null) {
    window.clearTimeout(captureTimer)
  }

  captureTimer = window.setTimeout(() => {
    captureTimer = null
    enqueueEmitCapture(reason)
  }, VIJIA_CAPTURE_DEBOUNCE_MS)
}

if (chrome.runtime?.id) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'VIJIA_SCHEDULE_CAPTURE' && typeof message.reason === 'string') {
      scheduleCapture(message.reason)
      sendResponse({ ok: true })
      return true
    }
    return false
  })
}

function installObservers() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      scheduleCapture('app-switch')
    } else if (document.visibilityState === 'visible') {
      scheduleCapture('tab-switch')
    }
  })

  window.addEventListener(
    'scroll',
    () => {
      if (scrollStopTimer !== null) {
        window.clearTimeout(scrollStopTimer)
      }
      scrollStopTimer = window.setTimeout(() => {
        scrollStopTimer = null
        scheduleCapture('scroll-pause')
      }, VIJIA_SCROLL_END_MS)
    },
    true
  )

  window.addEventListener(
    'keydown',
    () => {
      scheduleCapture('typing-start')
    },
    true
  )

  window.addEventListener(
    'keyup',
    () => {
      if (typingStopTimer !== null) {
        window.clearTimeout(typingStopTimer)
      }
      typingStopTimer = window.setTimeout(() => {
        typingStopTimer = null
        scheduleCapture('typing-stop')
      }, VIJIA_TYPING_STOP_IDLE_MS)
    },
    true
  )

  const observer = new MutationObserver(() => {
    if (domIdleTimer !== null) {
      window.clearTimeout(domIdleTimer)
    }
    domIdleTimer = window.setTimeout(() => {
      domIdleTimer = null
      scheduleCapture('typing-stop')
    }, VIJIA_DOM_IDLE_MS)
  })

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  })
}

installObservers()
scheduleCapture('typing-stop')
for (const delay of VIJIA_STARTUP_RETRY_DELAYS_MS) {
  window.setTimeout(() => enqueueEmitCapture(`startup-delay-${delay}`), delay)
}
