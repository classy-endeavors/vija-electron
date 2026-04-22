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

const PROACTIVE_CLAUDE_MAX_TOKENS = 1024;

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

function buildProactiveUserMessage(
  latestNote: SessionLogNote,
  sessionNotes: SessionLogNote[],
  behavior: UserBehaviorFile,
): string {
  return [
    "Hello, Claude. I'm the user. I'm using Vijia to chat with you.",
    "",
    "The following note just triggered this proactive check:",
    formatSessionNoteForPrompt(latestNote),
    "",
    "Recent session notes (oldest to newest in this list):",
    ...sessionNotes.map((n) => formatSessionNoteForPrompt(n)),
    "",
    "User / Vijia behavior summary:",
    summarizeUserBehaviorForPrompt(behavior),
  ].join("\n");
}
import {
  getEffectiveM3ProactiveCooldownMs,
  readUserBehavior,
  type SuggestionStats,
  type UserBehaviorFile,
} from "./user-behavior";
import { getClaudeProxyUrl, getSupabaseClientEnv } from "./supabaseEnv";
import api, { type ClaudeProxyRequest } from "../shared/Api";

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

function safePreview(value: unknown, max = 1000): string {
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.length > max ? `${text.slice(0, max)}...(truncated)` : text;
  } catch {
    return "[unserializable]";
  }
}

function isProactiveSuggestionType(
  value: unknown,
): value is ProactiveSuggestionType {
  return typeof value === "string" && (ALL_TYPES as string[]).includes(value);
}

function parseProactiveResponse(raw: unknown): ProactiveClaudeResponse | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
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
      console.warn(
        "[Vijia] Proactive engine: missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY; skipping Claude call.",
      );
    }
    return null;
  }

  const notes = await readLastSessionNotes(10);
  const behavior = await readUserBehavior();

  const body: ClaudeProxyRequest = {
    proactive: true,
    max_tokens: PROACTIVE_CLAUDE_MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: buildProactiveUserMessage(latestNote, notes, behavior),
      },
    ],
  };

  try {
    console.debug("[Vijia] proactive claude-proxy request", {
      url,
      latestNoteId: latestNote.id,
      latestNoteSite: latestNote.site,
      sessionNotesCount: notes.length,
      behaviorKeys: Object.keys(behavior ?? {}),
    });
    console.debug(
      "[Vijia] proactive claude-proxy request body",
      safePreview(JSON.stringify(body), 12000),
    );

    const res = await api.claudeProxy(body);

    if (res.status < 200 || res.status >= 300) {
      const responseText =
        typeof res.data === "string"
          ? res.data
          : res.data != null
            ? JSON.stringify(res.data)
            : "[empty response body]";
      console.warn("[Vijia] proactive claude-proxy HTTP", res.status, {
        statusText: res.statusText,
        requestSummary: {
          latestNoteId: latestNote.id,
          latestNoteSite: latestNote.site,
          sessionNotesCount: notes.length,
        },
        responseBodyPreview: safePreview(responseText),
      });
      return null;
    }

    const json: unknown = res.data;
    /** Supabase function may wrap body in `{ data: ... }` — accept both. */
    const payload =
      json &&
      typeof json === "object" &&
      "data" in (json as object) &&
      (json as { data?: unknown }).data !== undefined
        ? (json as { data: unknown }).data
        : json;

    console.debug(
      "[Vijia] proactive claude-proxy success payload",
      safePreview(payload),
    );

    const parsed = parseProactiveResponse(payload);
    if (parsed === null) {
      const keys =
        payload && typeof payload === "object"
          ? Object.keys(payload as object)
          : [];
      if (keys.includes("raw_text") && !keys.includes("should_speak")) {
        console.warn(
          "[Vijia] claude-proxy returned plain text (`raw_text`), not proactive JSON. " +
            "The edge function should return { should_speak, message?, type?, buttons? } when `proactive: true` in the request body — " +
            "e.g. parse the model output as JSON or use a tool/schema response. " +
            "As-is, Vijia cannot show a notification.",
          { responseKeys: keys },
        );
      } else {
        console.warn(
          "[Vijia] proactive claude-proxy: response is not valid proactive JSON (expected should_speak).",
          { responseKeys: keys, preview: safePreview(payload, 500) },
        );
      }
    }
    return parsed;
  } catch (error) {
    console.warn("[Vijia] proactive claude-proxy error:", error, {
      latestNoteId: latestNote.id,
      latestNoteSite: latestNote.site,
    });
    return null;
  }
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
    if (!parsed || parsed.should_speak === false) {
      return;
    }

    const actions = mapButtons(parsed.buttons);
    notificationManager.notify({
      message: parsed.message,
      contextSource: `Proactive — ${parsed.type}`,
      actions,
      priority: "normal",
      proactiveTracking: {
        sessionNoteId: note.id,
        suggestionType: parsed.type,
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
