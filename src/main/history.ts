import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import type { HistoryEntry } from '@shared/types'
import { getSettings } from './settings'

// Browsing history. Panels each keep their own Chromium back/forward stack, but
// that dies with the tab — this is the durable record of what was visited, so
// pages can be found again later.
//
// Kept as a flat JSON file: at the cap below it stays well under a megabyte and
// avoids a database dependency for what is a simple append-and-search list.

const MAX_ENTRIES = 10_000
const filePath = (): string => join(app.getPath('userData'), 'history.json')

let entries: HistoryEntry[] = []
let loaded = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

async function ensureLoaded(): Promise<void> {
  if (loaded) return
  loaded = true
  try {
    const parsed = JSON.parse(await readFile(filePath(), 'utf8')) as HistoryEntry[]
    if (Array.isArray(parsed)) entries = parsed
  } catch {
    entries = []
  }
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void persist(), 1500)
}

async function persist(): Promise<void> {
  try {
    const target = filePath()
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, JSON.stringify(entries), 'utf8')
  } catch {
    /* best effort */
  }
}

/** URLs that shouldn't be recorded — internal pages and blank navigations. */
function isRecordable(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

export async function recordVisit(url: string, title: string): Promise<void> {
  if (!getSettings().historyEnabled || !isRecordable(url)) return
  await ensureLoaded()

  // Collapse repeat visits to the same URL into one entry with a counter,
  // rather than filling the list with duplicates on every reload.
  const existing = entries.find((e) => e.url === url)
  if (existing) {
    existing.visitedAt = Date.now()
    existing.visits++
    if (title) existing.title = title
  } else {
    entries.push({ id: randomBytes(8).toString('hex'), url, title: title || url, visitedAt: Date.now(), visits: 1 })
    if (entries.length > MAX_ENTRIES) {
      entries.sort((a, b) => b.visitedAt - a.visitedAt)
      entries = entries.slice(0, MAX_ENTRIES)
    }
  }
  scheduleSave()
}

/** Update the title once the page reports one, so entries aren't bare URLs. */
export async function updateTitle(url: string, title: string): Promise<void> {
  if (!title || !getSettings().historyEnabled) return
  await ensureLoaded()
  const existing = entries.find((e) => e.url === url)
  if (existing && existing.title !== title) {
    existing.title = title
    scheduleSave()
  }
}

export async function listHistory(query = '', limit = 300): Promise<HistoryEntry[]> {
  await ensureLoaded()
  const q = query.trim().toLowerCase()
  const matched = q
    ? entries.filter((e) => e.url.toLowerCase().includes(q) || e.title.toLowerCase().includes(q))
    : entries
  return [...matched].sort((a, b) => b.visitedAt - a.visitedAt).slice(0, limit)
}

export async function clearHistory(): Promise<void> {
  await ensureLoaded()
  entries = []
  await persist()
}

export async function removeEntry(id: string): Promise<void> {
  await ensureLoaded()
  entries = entries.filter((e) => e.id !== id)
  scheduleSave()
}

/** Drop entries older than the retention window (0 = keep indefinitely). */
export async function pruneExpired(): Promise<number> {
  const days = getSettings().historyRetentionDays
  if (days <= 0) return 0
  await ensureLoaded()
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const before = entries.length
  entries = entries.filter((e) => e.visitedAt >= cutoff)
  if (entries.length !== before) await persist()
  return before - entries.length
}

/** Drop everything matching a predicate — used by forget-on-exit. */
export async function pruneWhere(shouldDrop: (url: string) => boolean): Promise<number> {
  await ensureLoaded()
  const before = entries.length
  entries = entries.filter((e) => !shouldDrop(e.url))
  if (entries.length !== before) await persist()
  return before - entries.length
}

export async function historyCount(): Promise<number> {
  await ensureLoaded()
  return entries.length
}

/** Flush pending writes before quit. */
export async function flushHistory(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (loaded) await persist()
}
