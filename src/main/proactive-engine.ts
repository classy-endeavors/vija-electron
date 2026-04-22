import type {
  ProactiveClaudeButton,
  ProactiveClaudeResponse,
  ProactiveSuggestionType,
} from "../shared/proactive";
import type { NotificationAction } from "../shared/notification";
import { notificationManager, BASE_COOLDOWN_MS } from "./NotificationManager";
import {
  onSessionNoteAppended,
  readLastSessionNotes,
  type SessionLogNote,
} from "./session-log";
import {
  getEffectiveM3ProactiveCooldownMs,
  readUserBehavior,
  type SuggestionStats,
  type UserBehaviorFile,
} from "./user-behavior";
import { getClaudeProxyUrl, getSupabaseClientEnv } from "./supabaseEnv";
import api, { type ClaudeProxyRequest } from "../shared/Api";

const PROACTIVE_CLAUDE_MAX_TOKENS = 1024;

/**
 * When true, the proactive call uses `buildProactiveUserMessageTest` instead of
 * the production prompt. The test prompt instructs the model to always return
 * a valid JSON response with `should_speak: true` so you can verify the proxy
 * and notification path end-to-end. Set to false to use the real prompt.
 */
const USE_TEST_PROACTIVE_PROMPT = true;

/** Set to false before release: when true, `should_speak: false` still shows a notification. */
const DEBUG_FORCE_PROACTIVE_ALWAYS_SPEAK = true;

function formatSessionNoteForPrompt(note: SessionLogNote): string {
  const title = (note.title ?? "").trim() || "Untitled";
  const head = `[${note.site}] ${title}`;
  const link = note.url ? `\n${note.url}` : "";
  const u = (note.user ?? "").trim();
  const a = (note.assistant ?? "").trim();
  const parts = [head + link];
  if (u) {
    parts.push("User:\n" + u);
  }
  if (a) {
    parts.push("Assistant:\n" + a);
  }
  return parts.join("\n\n");
}

function summarizeUserBehaviorForPrompt(behavior: UserBehaviorFile): string {
  const s = behavior.suggestion_stats;
  if (!s) {
    return "(no suggestion stats yet)";
  }
  return [
    `suggestions: shown ${s.totalShown}, accepted ${s.totalAccepted}, dismissed ${s.totalDismissed}`,
    `consecutive dismissals: ${s.consecutiveDismissals}; cooldown factor: ${s.cooldownMultiplier}x`,
  ].join("\n");
}

const PROACTIVE_SUGGESTION_TYPES_DESCRIPTION = [
  '- "guide_offer": offer to help or guide the user through a task they seem stuck on',
  '- "personal_context": surface relevant context from earlier notes the user may have forgotten',
  '- "return_nudge": gently nudge the user back to an unfinished task or conversation',
  '- "important_flag": flag something important the user should know or act on',
  '- "task_switch": suggest switching to a related task that would be more productive',
].join("\n");

function buildProactiveUserMessage(
  latestNote: SessionLogNote,
  sessionNotes: SessionLogNote[],
  behavior: UserBehaviorFile,
): string {
  return [
    "You are the proactive assistant inside Vijia, a desktop app that watches the",
    "user's AI chat sessions (ChatGPT, Claude, Gemini, etc.) and decides whether",
    "to surface a short, helpful notification to the user.",
    "",
    "You are NOT chatting with the user. Do not greet, do not ask questions, do",
    "not narrate what you see. Your only job is to decide: should Vijia show a",
    "proactive notification right now, and if so, what should it say?",
    "",
    "RESPONSE FORMAT — STRICT",
    "You MUST reply with a single JSON object and nothing else. No prose, no",
    "markdown, no code fences. The object must match exactly one of these shapes:",
    "",
    '  { "should_speak": false }',
    "",
    "  {",
    '    "should_speak": true,',
    '    "message": "<short notification text, <= 200 chars, second person>",',
    '    "type": "guide_offer" | "personal_context" | "return_nudge" | "important_flag" | "task_switch",',
    '    "buttons": [ { "id": "<slug>", "label": "<short label>" } ]   // optional, max 2',
    "  }",
    "",
    "Type meanings:",
    PROACTIVE_SUGGESTION_TYPES_DESCRIPTION,
    "",
    "DECISION RULES",
    "- Default to { \"should_speak\": false }. Only speak when there is clear,",
    "  concrete value for the user.",
    "- Do NOT speak for trivial notes (e.g. \"hi\", \"hello\", empty assistant",
    "  replies, greeting exchanges, or boilerplate like \"Create an image / Write",
    "  or edit / Look something up\").",
    "- Do NOT speak just because a new note arrived. Require a real signal across",
    "  recent notes (a stuck task, repeated question, abandoned thread, etc.).",
    "- Respect the cooldown/dismissal stats below: if the user has been",
    "  dismissing suggestions, be much more conservative.",
    "- Keep `message` under 200 characters, friendly, specific, and actionable.",
    "",
    "CONTEXT",
    "",
    "Triggering note:",
    formatSessionNoteForPrompt(latestNote),
    "",
    "Recent session notes (oldest to newest):",
    ...sessionNotes.map((n) => formatSessionNoteForPrompt(n)),
    "",
    "User / Vijia behavior summary:",
    summarizeUserBehaviorForPrompt(behavior),
    "",
    "Reply now with the JSON object only.",
  ].join("\n");
}

/**
 * Test-only user message: asks Claude to always reply with a single JSON object
 * matching the proactive contract and `should_speak: true`. Does not replace
 * the production prompt in `buildProactiveUserMessage`.
 */
function buildProactiveUserMessageTest(
  latestNote: SessionLogNote,
  sessionNotes: SessionLogNote[],
  behavior: UserBehaviorFile,
): string {
  return [
    "TEST MODE — Vijia proactive pipeline check.",
    "",
    "Ignore normal silence rules. Every time, reply with exactly one JSON object",
    "and nothing else (no markdown fences, no commentary). The object MUST be:",
    "",
    "  {",
    '    "should_speak": true,',
    '    "message": "Test: proactive notification (pipeline OK)",',
    '    "type": "guide_offer"',
    "  }",
    "",
    "Optional: you may add at most one button: ",
    '"buttons": [ { "id": "ok", "label": "OK" } ]',
    "",
    "Context (for your reference only; still output the JSON above):",
    "",
    "Triggering note:",
    formatSessionNoteForPrompt(latestNote),
    "",
    "Recent session notes (oldest to newest):",
    ...sessionNotes.map((n) => formatSessionNoteForPrompt(n)),
    "",
    "User / Vijia behavior summary:",
    summarizeUserBehaviorForPrompt(behavior),
  ].join("\n");
}

const ALL_TYPES: ProactiveSuggestionType[] = [
  "guide_offer",
  "personal_context",
  "return_nudge",
  "important_flag",
  "task_switch",
];

let warnedMissingEnv = false;
let inflight = false;
let unsubscribe: (() => void) | null = null;

function isProactiveSuggestionType(
  value: unknown,
): value is ProactiveSuggestionType {
  return typeof value === "string" && (ALL_TYPES as string[]).includes(value);
}

/**
 * Try to pull a JSON object out of an otherwise non-JSON model reply. Models
 * sometimes wrap JSON in markdown fences or add prose around it.
 */
function extractJsonObjectFromText(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidates: string[] = [];
  if (fenced && fenced[1]) {
    candidates.push(fenced[1].trim());
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  candidates.push(trimmed);

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Server returns `{ parse_error: true, raw_text: "..." }` when structured
 * JSON could not be parsed by the edge function. Try once more to extract
 * JSON from the raw text; if that fails, treat it as "nothing to say" rather
 * than surfacing a conversational reply as a suggestion.
 */
function parseProactiveFromParseError(
  o: Record<string, unknown>,
): ProactiveClaudeResponse | null {
  if (o.parse_error !== true) {
    return null;
  }
  const raw = o.raw_text;
  if (typeof raw !== "string" || !raw.trim()) {
    return { should_speak: false };
  }
  const recovered = extractJsonObjectFromText(raw);
  if (recovered !== null) {
    const parsed = parseProactiveResponseStrict(
      recovered as Record<string, unknown>,
    );
    if (parsed !== null) {
      return parsed;
    }
  }
  console.warn(
    "[Vijia] proactive: claude returned non-JSON text, suppressing notification",
  );
  return { should_speak: false };
}

/** Validate a decoded object against the proactive JSON contract. */
function parseProactiveResponseStrict(
  o: Record<string, unknown>,
): ProactiveClaudeResponse | null {
  if (o.should_speak === false) {
    return { should_speak: false };
  }
  if (o.should_speak !== true) {
    return null;
  }
  const message = o.message;
  const type = o.type;
  if (typeof message !== "string" || !message.trim()) {
    return null;
  }
  if (!isProactiveSuggestionType(type)) {
    return null;
  }
  const buttonsRaw = o.buttons;
  let buttons: ProactiveClaudeButton[] | undefined;
  if (Array.isArray(buttonsRaw)) {
    const mapped: ProactiveClaudeButton[] = [];
    for (const b of buttonsRaw) {
      if (!b || typeof b !== "object") continue;
      const br = b as Record<string, unknown>;
      if (typeof br.id !== "string" || typeof br.label !== "string") continue;
      mapped.push({ id: br.id, label: br.label });
    }
    buttons = mapped.length > 0 ? mapped : undefined;
  }
  return {
    should_speak: true,
    message: message.trim(),
    type,
    buttons,
  };
}

function parseProactiveResponse(raw: unknown): ProactiveClaudeResponse | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const fromError = parseProactiveFromParseError(o);
  if (fromError !== null) {
    return fromError;
  }
  return parseProactiveResponseStrict(o);
}

const PROACTIVE_UNWRAP_MAX_DEPTH = 4;

/**
 * Edge may return `{ data: ... }`, `{ payload: ... }`, or both nested. Peel until
 * we reach the object that has should_speak / parse_error / message etc.
 */
function unwrapProactiveResponseBody(input: unknown): unknown {
  let current: unknown = input;
  for (let i = 0; i < PROACTIVE_UNWRAP_MAX_DEPTH; i++) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      break;
    }
    const o = current as Record<string, unknown>;
    if ("data" in o && o.data !== undefined) {
      current = o.data;
      continue;
    }
    if (
      "payload" in o &&
      o.payload !== null &&
      typeof o.payload === "object" &&
      !Array.isArray(o.payload)
    ) {
      current = o.payload;
      continue;
    }
    break;
  }
  return current;
}

function shouldSkipForCooldown(stats: SuggestionStats): boolean {
  const anchor = stats.lastProactiveShownAt;
  if (anchor === null || anchor === undefined) {
    return false;
  }
  const effective = getEffectiveM3ProactiveCooldownMs(BASE_COOLDOWN_MS, stats);
  return Date.now() - anchor < effective;
}

async function callClaudeProactive(
  latestNote: SessionLogNote,
): Promise<ProactiveClaudeResponse | null> {
  const env = getSupabaseClientEnv();
  const url = getClaudeProxyUrl();
  if (!env || !url) {
    if (!warnedMissingEnv) {
      warnedMissingEnv = true;
      console.warn("[Vijia] proactive: missing Supabase env, skip");
    }
    return null;
  }

  const notes = await readLastSessionNotes(10);
  const behavior = await readUserBehavior();

  const userContent = USE_TEST_PROACTIVE_PROMPT
    ? buildProactiveUserMessageTest(latestNote, notes, behavior)
    : buildProactiveUserMessage(latestNote, notes, behavior);

  const body: ClaudeProxyRequest = {
    proactive: true,
    max_tokens: PROACTIVE_CLAUDE_MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: userContent,
      },
    ],
  };

  try {
    console.log({ body });
    const res = await api.claudeProxy(body);

    if (res.status < 200 || res.status >= 300) {
      console.warn(
        `[Vijia] proactive: claude-proxy ${res.status} ${res.statusText ?? ""}`.trim(),
      );
      return null;
    }
    console.log({ res: res.data });
    const json: unknown = res.data;
    const payload = unwrapProactiveResponseBody(json);
    console.log({ payload });
    const parsed = parseProactiveResponse(payload);
    if (parsed === null) {
      console.warn(
        "[Vijia] proactive: invalid response (need should_speak JSON)",
      );
    }
    return parsed;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[Vijia] proactive: ${msg}`);
    return null;
  }
}

function applyDebugForceProactiveSpeak(
  parsed: ProactiveClaudeResponse | null,
): ProactiveClaudeResponse | null {
  if (!DEBUG_FORCE_PROACTIVE_ALWAYS_SPEAK || !parsed) {
    return parsed;
  }
  if (parsed.should_speak) {
    return parsed;
  }
  return {
    should_speak: true,
    message: "[Debug] Forced speak — model returned should_speak: false",
    type: "guide_offer",
  };
}

function mapButtons(
  buttons: ProactiveClaudeButton[] | undefined,
): NotificationAction[] {
  if (buttons && buttons.length > 0) {
    return buttons.map((b) => ({
      id: b.id,
      label: b.label,
      kind: "custom" as const,
    }));
  }
  return [
    { id: "ok", label: "Got it", kind: "custom" },
    { id: "dismiss", label: "dismiss", kind: "dismiss" },
  ];
}

async function handleNote(note: SessionLogNote): Promise<void> {
  if (inflight) {
    return;
  }
  inflight = true;
  try {
    const stats = (await readUserBehavior()).suggestion_stats;
    if (shouldSkipForCooldown(stats)) {
      return;
    }

    const parsed = await callClaudeProactive(note);
    const effective = applyDebugForceProactiveSpeak(parsed);
    if (!effective || effective.should_speak === false) {
      return;
    }

    const actions = mapButtons(effective.buttons);
    notificationManager.notify({
      message: effective.message,
      contextSource: `Proactive — ${effective.type}`,
      actions,
      priority: "normal",
      proactiveTracking: {
        sessionNoteId: note.id,
        suggestionType: effective.type,
      },
    });
  } finally {
    inflight = false;
  }
}

export function startProactiveEngine(): void {
  if (unsubscribe) {
    return;
  }
  unsubscribe = onSessionNoteAppended((note) => {
    void handleNote(note);
  });
}

export function stopProactiveEngine(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
