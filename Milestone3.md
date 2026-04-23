# Milestone 3: Text Extraction + Proactive Suggestions

[cite_start]**Target Completion:** Friday, April 24, 2026 [cite: 403, 437]
**Internal Sub-targets:** Part A by April 18; [cite_start]Part B by April 24 [cite: 437, 438]

---

## 3.1 Goals
* [cite_start]**Capture Context:** Extract high-signal text from AI-chat windows (ChatGPT, Claude, Gemini, etc.) instead of screenshots to reduce token costs and improve analysis[cite: 440].
* [cite_start]**Proactive Engagement:** Use analysis notes to trigger helpful notifications via the existing `NotificationManager`[cite: 441].
* [cite_start]**Behavioral Learning:** Persist user accept/dismiss signals in `user-behavior.json` for long-term AI learning[cite: 442].

---

## 3.A Part A — Text Extraction Pipeline

### 3.A.1 Site Detection (Window-Title Match)
[cite_start]Detection is handled by substring matching via `node-active-window`[cite: 450, 451].

| Site | Window-title substring match |
| :--- | :--- |
| [cite_start]**ChatGPT** | contains "ChatGPT" [cite: 451] |
| [cite_start]**Claude** | contains "Claude" AND ("claude.ai" OR "Claude ") [cite: 451] |
| [cite_start]**Gemini** | contains "Gemini" AND "Google" [cite: 451] |
| [cite_start]**Perplexity** | contains "Perplexity" [cite: 451] |
| [cite_start]**DeepSeek** | contains "DeepSeek" [cite: 451] |
| **Fallback** | [cite_start]Anything else (triggers screenshot flow) [cite: 451] |
| **Self** | [cite_start]Vijia window focused (ABORTS pipeline) [cite: 451] |

### 3.A.2 Streaming Detection Rule
[cite_start]To avoid capturing partial AI responses, Vijia waits for the stream to stabilize[cite: 454, 457]:
1.  [cite_start]Execute `document.body.innerText` (t0)[cite: 458].
2.  [cite_start]Wait **1000 ms**[cite: 459].
3.  Execute again (t1). [cite_start]If **t0 === t1**, proceed[cite: 460, 461].
4.  [cite_start]**Timeout:** Give up after **20 s** of instability; do not write a note[cite: 463].

### 3.A.3 Extraction & Scrubbing
* [cite_start]**Last Pair Only:** Only the most recent user and assistant message block are kept[cite: 466, 470].
* [cite_start]**Truncation:** User blocks are capped at **4 KB**; assistant blocks at **12 KB**[cite: 471].
* [cite_start]**Secret Scrubbing:** Regex pass identifies and replaces emails, API keys, and phone numbers with `[redacted]`[cite: 472].

### 3.A.4 Capture Trigger Model
[cite_start]Triggers are event-based with a **10 s global debounce**[cite: 476, 478].
* [cite_start]**app-switch / tab-switch:** Focused app or browser tab changes[cite: 477].
* [cite_start]**typing-stop / scroll-pause:** 3 s of inactivity after the action[cite: 477].
* [cite_start]**typing-start:** First keystroke after being idle[cite: 477].

---

## 3.B Part B — Proactive Suggestion Engine

### 3.B.1 Suggestion Flow
1.  [cite_start]**Trigger:** Reacts to the `vijia:note-appended` IPC event[cite: 519].
2.  [cite_start]**Context:** Loads the last **10 notes** and the full `user-behavior.json`[cite: 520].
3.  [cite_start]**AI Call:** POST to `claude-proxy` with `proactive: true`[cite: 521].
4.  [cite_start]**Notification:** If `should_speak` is true, shows a notification with a **10-min cooldown**[cite: 525].

### 3.B.2 Proactive Response Contract
[cite_start]The engine expects the following JSON shape from the AI[cite: 529, 530]:
```json
{
  "should_speak": true,
  "message": "string (≤ 240 chars)",
  "type": "guide_offer | personal_context | return_nudge | important_flag | task_switch",
  "buttons": [
    { "id": "guide_me", "label": "Guide me" },
    { "id": "dismiss", "label": "Dismiss" }
  ]
}
```

### 3.B.3 Accept / Dismiss Semantics
[cite_start]User interactions update `user-behavior.json`[cite: 526].

| Event | Counter Change | History Entry Action |
| :--- | :--- | :--- |
| **Click Action Button** | `total_accepted` +1; `consecutive_dismissals` = 0 | [cite_start]"accepted" [cite: 543] |
| **Click Dismiss** | `total_dismissed` +1; `consecutive_dismissals` +1 | [cite_start]"dismissed" [cite: 543] |
| **Fade Out (No Interaction)** | `total_dismissed` +1; `consecutive_dismissals` +1 | [cite_start]"dismissed" [cite: 543] |

[cite_start]**Backoff Rule:** If `consecutive_dismissals` reaches **3**, the cooldown multiplier doubles (capped at 8x)[cite: 543].

---

## 3.1.4 Files & Infrastructure
* **Data Stores:**
    * [cite_start]`data/session-log.jsonl`: Stores atomic analysis notes[cite: 489, 490].
    * [cite_start]`data/user-behavior.json`: Stores user profile and suggestion stats (written atomically)[cite: 534, 535, 562].
* **Key Files to Create:**
    * [cite_start]`src/main/text-extraction.ts`: Detection, streaming logic, and scrubbing[cite: 498].
    * [cite_start]`src/main/session-log.ts`: Atomic append and tail-read functions[cite: 498].
    * [cite_start]`src/main/proactive-engine.ts`: Logic for calling Claude and routing to notifications[cite: 551].
    * [cite_start]`src/main/user-behavior.ts`: Profile management[cite: 551].