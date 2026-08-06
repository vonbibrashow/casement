// Builds build/licenses.json — the third-party attribution manifest shipped
// with the app. Chromium is BSD-3-Clause and most npm deps are MIT/ISC; all of
// them require their copyright notice and licence text to travel with binary
// redistributions, so this is a shipping requirement, not a nicety.
//
// Run via `npm run licenses` (also runs automatically before `npm run dist`).

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const LICENSE_FILES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md', 'license', 'COPYING']

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Every installed package reachable from production dependencies, walked
 * straight from node_modules. Optional dependencies that were never installed
 * (ws's bufferutil, zustand's immer) simply don't resolve and so are excluded —
 * which is correct, because we don't ship them.
 */
function productionPackages() {
  const rootPkg = readJson(join(root, 'package.json'))
  const seen = new Set()
  const queue = Object.keys(rootPkg?.dependencies ?? {})
  while (queue.length) {
    const name = queue.shift()
    if (seen.has(name)) continue
    const meta = readJson(join(root, 'node_modules', ...name.split('/'), 'package.json'))
    if (!meta) continue // not installed
    seen.add(name)
    queue.push(...Object.keys(meta.dependencies ?? {}))
  }
  return [...seen].sort((a, b) => a.localeCompare(b))
}

function licenseTextFor(pkgDir) {
  if (!existsSync(pkgDir)) return ''
  let entries = []
  try {
    entries = readdirSync(pkgDir)
  } catch {
    return ''
  }
  const match = LICENSE_FILES.find((f) => entries.includes(f)) ?? entries.find((f) => /^licen[cs]e/i.test(f))
  if (!match) return ''
  try {
    return readFileSync(join(pkgDir, match), 'utf8').trim()
  } catch {
    return ''
  }
}

const packages = []
for (const name of productionPackages()) {
  const dir = join(root, 'node_modules', ...name.split('/'))
  const meta = readJson(join(dir, 'package.json'))
  if (!meta) continue
  const license =
    typeof meta.license === 'string' ? meta.license : meta.license?.type ?? (meta.licenses?.[0]?.type || 'See licence text')
  packages.push({
    name,
    version: meta.version ?? '',
    license,
    homepage: meta.homepage ?? (typeof meta.repository === 'string' ? meta.repository : meta.repository?.url) ?? '',
    text: licenseTextFor(dir)
  })
}

// Electron bundles Chromium and Node. Their full texts ship as separate files
// beside the executable (LICENSE / LICENSES.chromium.html), which the app links
// to rather than inlining — the Chromium one alone is several megabytes.
const electronVersion = readJson(join(root, 'node_modules', 'electron', 'package.json'))?.version ?? ''

const manifest = {
  generatedAt: new Date().toISOString(),
  runtime: {
    electron: electronVersion,
    chromium: 'Bundled with Electron — BSD-3-Clause and others; see LICENSES.chromium.html',
    note: 'This application is built on Electron, which bundles Chromium and Node.js. It is not Google Chrome and is not affiliated with or endorsed by Google.'
  },
  packages
}

const out = join(root, 'build', 'licenses.json')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(manifest, null, 2), 'utf8')
const withText = packages.filter((p) => p.text).length
console.log(`wrote ${out}: ${packages.length} packages (${withText} with licence text), electron ${electronVersion}`)
