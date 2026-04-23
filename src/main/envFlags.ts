function envFlagStringTrue(raw: string | undefined): boolean {
  const e = (raw ?? "").trim().toLowerCase();
  return e === "1" || e === "true" || e === "yes";
}

/**
 * When true (e.g. `VIJIA_DISABLE_COOLDOWNS=1` in `.env`), main-process throttles are skipped.
 *
 * **Must** use static `process.env.VIJIA_DISABLE_COOLDOWNS` so `electron.vite` `define` in
 * `electron.vite.config.ts` inlines the value from `loadEnv` at build time.
 * Dynamic `process.env[name]` is never replaced and is always empty at runtime in Electron.
 */
export function isCooldownsDisabled(): boolean {
  return envFlagStringTrue(process.env.VIJIA_DISABLE_COOLDOWNS);
}
