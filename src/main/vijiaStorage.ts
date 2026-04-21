import { app } from 'electron'
import path from 'node:path'

/**
 * Dev: `<repo>/.vijia`. Packaged: Electron `userData`.
 * Must match `browserBridge.ts` and `session-log` / `user-behavior` paths.
 */
export function getVijiaStorageRoot(): string {
  const fromEnv = process.env['VIJIA_BRIDGE_REPO_DIR']?.trim()
  if (fromEnv) {
    return path.resolve(fromEnv)
  }
  if (!app.isPackaged) {
    return path.join(process.cwd(), '.vijia')
  }
  return app.getPath('userData')
}

export function getVijiaDataDir(): string {
  return path.join(getVijiaStorageRoot(), 'data')
}
