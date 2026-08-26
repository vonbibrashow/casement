import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppSettings, SearchEngine } from '@shared/types'

// User preferences, kept in memory and mirrored to settings.json. Several of
// these used to be hardcoded constants (search engine, sleep threshold, live-tab
// budget) — they're settings now so behaviour can be tuned without a rebuild.

export const DEFAULT_SETTINGS: AppSettings = {
  newTabUrl: 'https://www.google.com',
  searchEngine: 'google',
  autoHideChrome: false,
  autoHideToolbar: false,
  // Secure by default: a site has to be granted these, not merely ask.
  blockTrackers: true,
  httpsUpgrade: true,
  allowCameraMic: false,
  allowLocation: false,
  allowNotifications: false,
  historyEnabled: true,
  historyRetentionDays: 90,
  sleepAfterMinutes: 5,
  maxLiveTabs: 16
}

const filePath = (): string => join(app.getPath('userData'), 'settings.json')

let cache: AppSettings | null = null

export function getSettings(): AppSettings {
  if (cache) return cache
  try {
    const parsed = JSON.parse(readFileSync(filePath(), 'utf8')) as Partial<AppSettings>
    cache = { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    cache = { ...DEFAULT_SETTINGS }
  }
  return cache
}

export function setSettings(next: Partial<AppSettings>): AppSettings {
  const merged = { ...getSettings(), ...next }
  // Guard the numeric fields: a zero or negative budget would sleep every tab
  // the moment it opened.
  merged.sleepAfterMinutes = Math.max(1, Math.round(merged.sleepAfterMinutes))
  merged.maxLiveTabs = Math.max(1, Math.round(merged.maxLiveTabs))
  merged.historyRetentionDays = Math.max(0, Math.round(merged.historyRetentionDays))
  cache = merged
  try {
    const target = filePath()
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, JSON.stringify(merged, null, 2), 'utf8')
  } catch {
    /* best effort — keep the in-memory value regardless */
  }
  return merged
}

const SEARCH_URLS: Record<SearchEngine, string> = {
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  bing: 'https://www.bing.com/search?q='
}

export function searchUrlFor(query: string): string {
  return SEARCH_URLS[getSettings().searchEngine] + encodeURIComponent(query)
}
