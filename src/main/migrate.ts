import { app } from 'electron'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

// Electron derives userData from the app name, so renaming the app points it at
// a fresh empty directory — silently orphaning saved workspaces and every
// panel's cookies (i.e. logging the user out of everything). This copies the
// old profile across once, the first time the renamed build starts.

const LEGACY_NAMES = ['multibrowser', 'Workspace Browser']

/** Carried over: settings plus per-panel sessions. */
const CARRY = ['workspace.json', 'privacy.json', 'window-state.json', 'Partitions']

/** Regenerable caches — skipped so the copy stays small and quick. */
const SKIP_DIRS = new Set([
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'ShaderCache',
  'GrShaderCache'
])

/** Returns the profile migrated from, or null if there was nothing to do. */
export function migrateUserData(): string | null {
  const target = app.getPath('userData')
  // Anything already here means this profile is in use; never overwrite it.
  if (existsSync(join(target, 'workspace.json'))) return null

  const parent = dirname(target)
  for (const legacy of LEGACY_NAMES) {
    const source = join(parent, legacy)
    if (source === target || !existsSync(join(source, 'workspace.json'))) continue
    try {
      mkdirSync(target, { recursive: true })
      for (const entry of CARRY) {
        const from = join(source, entry)
        if (!existsSync(from)) continue
        cpSync(from, join(target, entry), {
          recursive: true,
          filter: (src) => !SKIP_DIRS.has(basename(src))
        })
      }
      return legacy
    } catch {
      return null // best effort: a failed migration must not block startup
    }
  }
  return null
}
