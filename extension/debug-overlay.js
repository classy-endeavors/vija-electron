/* Debug-only: floating log when extension option `debugOverlay` is true. */
;(() => {
  const PANEL_ID = 'vijia-ext-debug-root'
  const MAX_LINES = 80

  const state = {
    enabled: false,
    host: null
  }

  const lines = /** @type {Array<Record<string, unknown>>} */ ([])

  function nowTime() {
    return new Date().toISOString().slice(11, 19)
  }

  function shortText(s, max) {
    if (s == null) {
      return ''
    }
    const t = String(s).replace(/\s+/g, ' ').trim()
    if (t.length <= max) {
      return t
    }
    return `${t.slice(0, max - 1)}…`
  }

  function addLine(obj) {
    if (!state.enabled) {
      return
    }
    const rec =
      typeof obj === 'string'
        ? { msg: obj }
        : { ...obj }
    rec.t = rec.t || nowTime()
    lines.push(rec)
    if (lines.length > MAX_LINES) {
      lines.splice(0, lines.length - MAX_LINES)
    }
    render()
  }

  function clearPanel() {
    if (state.host) {
      state.host.remove()
      state.host = null
    }
  }

  function render() {
    const inner = state.host?.shadowRoot?.getElementById('vijia-dbg-content')
    if (!inner) {
      return
    }
    const rows = lines
      .map((L) => {
        const p = { ...L }
        delete p.t
        const detail = shortText(
          p.detail != null ? (typeof p.detail === 'string' ? p.detail : JSON.stringify(p.detail)) : p.msg || '',
          200
        )
        return `<div class="row" title="${escapeAttr(detail)}"><span class="time">[${escapeHtml(String(L.t))}]</span> <span class="k">${escapeHtml(p.kind || 'log')}</span> ${escapeHtml(detail)}</div>`
      })
      .join('')
    inner.innerHTML = rows
    inner.scrollTop = inner.scrollHeight
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;')
  }

  function ensureHost() {
    if (state.host) {
      return
    }
    const host = document.createElement('div')
    host.id = PANEL_ID
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        :host, #root {
          all: initial;
        }
        #root {
          position: fixed;
          z-index: 2147483646;
          right: 12px;
          bottom: 12px;
          width: min(400px, calc(100vw - 24px));
          max-height: 40vh;
          display: flex;
          flex-direction: column;
          font: 11px/1.35 ui-monospace, "Cascadia Code", "SFMono-Regular", Menlo, Consolas, monospace;
          color: #e2e8f0;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.4);
          border-radius: 8px;
          box-shadow: 0 8px 32px rgba(0,0,0,.4);
        }
        #head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 10px;
          background: rgba(30, 41, 59, 0.9);
          border-bottom: 1px solid rgba(100, 116, 139, 0.35);
          font-weight: 600;
          color: #f8fafc;
          flex: 0 0 auto;
        }
        #head small { font-weight: 400; color: #94a3b8; font-size: 10px; }
        #head button {
          font: inherit;
          color: #cbd5e1;
          background: #334155;
          border: none;
          border-radius: 4px;
          padding: 2px 8px;
          cursor: pointer;
        }
        #head button:hover { background: #475569; }
        #vijia-dbg-content {
          padding: 6px 8px 8px;
          overflow: auto;
          flex: 1 1 auto;
          min-height: 0;
        }
        .row { margin-bottom: 3px; word-break: break-word; }
        .row .time { color: #64748b; }
        .row .k { color: #38bdf8; font-weight: 600; }
        .on { color: #4ade80; }
        .off { color: #f87171; }
        .note { color: #94a3b8; font-size: 10px; }
      </style>
      <div id="root">
        <div id="head">
          <span>Vijia bridge <small>(debug)</small></span>
          <span>
            <button type="button" data-act="copy">Copy log</button>
            <button type="button" data-act="min">_</button>
            <button type="button" data-act="close">×</button>
          </span>
        </div>
        <div id="vijia-dbg-content" aria-live="polite"></div>
        <div class="note" id="vijia-dbg-note" style="padding: 0 8px 6px; display: none;">Minimized (reload page to show again, or re-enable in extension options.)</div>
      </div>
    `
    const head = shadow.getElementById('root')
    head
      .querySelector('#head')
      .addEventListener('click', (e) => {
        const b = e.target
        if (!(b instanceof HTMLButtonElement)) {
          return
        }
        const a = b.getAttribute('data-act')
        if (a === 'close') {
          void chrome.storage.local.set({ debugOverlay: false }, () => {
            void chrome.runtime?.lastError
            lines.length = 0
            state.enabled = false
            clearPanel()
          })
        } else if (a === 'min') {
          const content = shadow.getElementById('vijia-dbg-content')
          const note = shadow.getElementById('vijia-dbg-note')
          if (content) {
            content.style.display = content.style.display === 'none' ? '' : 'none'
            if (note) {
              note.style.display = content.style.display === 'none' ? 'block' : 'none'
            }
          }
        } else if (a === 'copy') {
          const t = lines
            .map((L) => {
              const p = { ...L }
              delete p.t
              return `[${L.t}] ${p.kind || 'log'} ${p.detail != null ? (typeof p.detail === 'string' ? p.detail : JSON.stringify(p.detail)) : p.msg || ''}`
            })
            .join('\n')
          void navigator.clipboard.writeText(t).catch(() => {})
        }
      })
    document.documentElement.appendChild(host)
    state.host = host
    render()
  }

  function applyStorage(result) {
    const next = Boolean(result && result.debugOverlay)
    if (state.enabled === next) {
      if (next) {
        ensureHost()
        render()
      } else {
        clearPanel()
      }
      return
    }
    state.enabled = next
    if (state.enabled) {
      ensureHost()
      addLine({ kind: 'opt', detail: 'Debug overlay on' })
    } else {
      lines.length = 0
      clearPanel()
    }
  }

  async function refreshFromStorage() {
    const r = await chrome.storage.local.get({ debugOverlay: false })
    applyStorage(r)
  }

  window.__VijiaExtDebug = {
    isEnabled: () => state.enabled,
    log(obj) {
      if (typeof obj === 'string') {
        addLine({ kind: 'log', detail: obj })
        return
      }
      const kind = obj.kind || 'log'
      const detail = obj.detail !== undefined ? obj.detail : obj.msg
      addLine({ kind, detail })
    },
    start() {
      void refreshFromStorage()
      chrome.storage.onChanged.addListener((ch, area) => {
        if (area !== 'local' || ch.debugOverlay == null) {
          return
        }
        applyStorage({ debugOverlay: ch.debugOverlay.newValue === true })
      })
    }
  }
})()
