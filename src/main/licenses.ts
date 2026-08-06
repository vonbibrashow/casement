import { app, shell } from 'electron'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { LicenseManifest } from '@shared/types'

// Chromium is BSD-3-Clause and the npm dependencies are MIT/ISC; all of them
// require their notices to ship with the binary. The manifest is generated at
// build time (scripts/generate-licenses.mjs) and read from resources at runtime.

function manifestPath(): string {
  const packaged = join(process.resourcesPath ?? '', 'licenses.json')
  if (app.isPackaged && existsSync(packaged)) return packaged
  return join(app.getAppPath(), 'build', 'licenses.json')
}

export async function loadLicenses(): Promise<LicenseManifest | null> {
  try {
    return JSON.parse(await readFile(manifestPath(), 'utf8')) as LicenseManifest
  } catch {
    return null
  }
}

/**
 * Chromium's own licence file is several megabytes of HTML that Electron ships
 * beside the executable, so it's opened externally rather than inlined.
 */
export async function openChromiumLicenses(): Promise<boolean> {
  const candidates = app.isPackaged
    ? [
        join(dirname(app.getPath('exe')), 'LICENSES.chromium.html'),
        join(process.resourcesPath ?? '', 'LICENSES.chromium.html')
      ]
    : [join(app.getAppPath(), 'node_modules', 'electron', 'dist', 'LICENSES.chromium.html')]
  for (const p of candidates) {
    if (existsSync(p)) {
      await shell.openPath(p)
      return true
    }
  }
  return false
}
