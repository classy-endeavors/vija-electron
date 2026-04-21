import axios, { AxiosInstance } from "axios";

const root = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");

export const SUPABASE_FUNCTIONS_BASE = `${root}/functions/v1`;
export const GEMINI_PROXY_URL = `${SUPABASE_FUNCTIONS_BASE}/gemini-proxy`;
export const CLAUDE_PROXY_URL = `${SUPABASE_FUNCTIONS_BASE}/claude-proxy`;

export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash-preview-04-17";

export function supabaseHeaders(): Record<string, string> {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    apikey: key,
  };
}

class API {
  instance: AxiosInstance;

  constructor() {
    this.instance = axios.create({
      baseURL: SUPABASE_FUNCTIONS_BASE,
      headers: supabaseHeaders(),
    });
  }

  async geminiProxy(body: any) {
    return this.instance.post(GEMINI_PROXY_URL, body);
  }

  async claudeProxy(body: any) {
    return this.instance.post(CLAUDE_PROXY_URL, body);
  }
}

const api = new API();
export default api;
