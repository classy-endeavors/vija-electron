/**
 * Supabase URL + anon key for main-process calls (claude-proxy).
 * Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the environment
 * (e.g. `.env.local` loaded by your shell or CI).
 */
export function getSupabaseClientEnv(): { url: string; key: string } | null {
  const url = (process.env['VITE_SUPABASE_URL'] ?? '').trim().replace(/\/$/, '')
  const key = (process.env['VITE_SUPABASE_ANON_KEY'] ?? '').trim()
  if (!url || !key) {
    return null
  }
  return { url, key }
}

export function getClaudeProxyUrl(): string | null {
  const env = getSupabaseClientEnv()
  if (!env) {
    return null
  }
  return `${env.url}/functions/v1/claude-proxy`
}
