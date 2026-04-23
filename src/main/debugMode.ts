/**
 * Main-process debug / verbose `console` output. Solely from env — set
 * `VIJIA_DEBUG=1` (or `true` / `yes`) in the process environment. Does not
 * use `app.isPackaged` or any other heuristics.
 */
export function isMainProcessDebugMode(): boolean {
  const e = process.env["VIJIA_DEBUG"]?.trim().toLowerCase();
  return e === "1" || e === "true" || e === "yes";
}
