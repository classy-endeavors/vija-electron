Here's a full breakdown of what needs to be covered in **Milestone 3** (due **Friday, April 24, 2026**):

---

## 🎯 Overall Goal
Build two connected systems: a **Text Extraction Pipeline** (Part A) and a **Proactive Suggestion Engine** (Part B).

---

## Part A — Text Extraction Pipeline (Due: Sat, Apr 18)

**What it does:** Instead of always taking screenshots, Vijia extracts the actual text from AI chat sites (ChatGPT, Claude, Gemini, Perplexity, DeepSeek) for cleaner, cheaper Gemini analysis.

**Key things to build:**

1. **`detectSite()`** in `src/main/text-extraction.ts` — detects which AI chat site is active via window title (using `node-active-window`). If Vijia itself is the active window, abort everything.

2. **Streaming detection** — poll `document.body.innerText` every 1 second, wait until it stabilises (two identical snapshots). Timeout after 20 s if it never stabilises.

3. **Last message pair extraction** — extract only the last user message (≤4 KB) and last assistant reply (≤12 KB), with secret scrubbing (emails, API keys, phone numbers → `[redacted]`).

4. **5 capture triggers** (app-switch, tab-switch, typing-stop, scroll-pause, typing-start) with a **10 s global debounce**. Non-AI-chat apps fall back to the existing screenshot flow.

5. **`session-log.ts`** — atomically append each analysis note to `data/session-log.jsonl` and emit `vijia:note-appended` IPC event.

---

## Part B — Proactive Suggestion Engine (Due: Fri, Apr 24)

**What it does:** After each new note, ask Claude whether Vijia should say something to the user — and if so, show a notification.

**Key things to build:**

1. **`proactive-engine.ts`** — subscribes to `vijia:note-appended`, loads the last 10 notes + `user-behavior.json`, calls `claude-proxy` with `{ proactive: true }`, and routes the result to `NotificationManager`.

2. **Claude response handling** — Claude returns either `{ should_speak: false }` (stay silent) or `{ should_speak: true, message, type, buttons }`. Any malformed response is treated as "stay silent" without crashing.

3. **Suggestion types** from the enum: `guide_offer`, `personal_context`, `return_nudge`, `important_flag`, `task_switch`.

4. **`user-behavior.ts`** — read/write `user-behavior.json` atomically (tmp-file + rename). In M3, only `suggestion_stats` is written; everything else (skill level, tone prefs, etc.) is read-only.

5. **Accept/dismiss tracking** in `suggestion_stats` — track total shown/accepted/dismissed, consecutive dismissals, and cooldown multiplier (doubles at 3 consecutive dismissals, capped at 8x, resets on any accept). Last 50 history entries kept (FIFO).

6. **Priority is always `"normal"`** — Claude never chooses priority; the existing 10-min cooldown in `NotificationManager` applies automatically.

---

## Files to Create/Modify

| File | Action |
|---|---|
| `src/main/text-extraction.ts` | CREATE |
| `src/main/session-log.ts` | CREATE |
| `src/main/proactive-engine.ts` | CREATE |
| `src/main/user-behavior.ts` | CREATE |
| `src/main/main.ts` | MODIFY (wire both at startup) |
| `src/shared/ipcChannels.ts` | MODIFY (add `vijia:notification-outcome`) |

---

## Open Questions Blocking M3

- **Q2**: Should the proactive engine replay the last stored note on app launch, or only react to new notes? (Default: only new)
- **Q9** *(needs answer before coding Part B)*: Does Claude return all 5 suggestion types in M3, or only `guide_offer` + `personal_context`?