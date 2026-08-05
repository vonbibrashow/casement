import { app, session } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AppState, PanelState, PrivacyPreview, PrivacyRules } from '@shared/types'
import { DEFAULT_RULES, hostOf, partitionHosts } from './rules'
import { shouldForget } from './rules'
import { loadApp, saveApp } from '../workspace/persistence'

const rulesPath = (): string => join(app.getPath('userData'), 'privacy.json')

export async function loadRules(): Promise<PrivacyRules> {
  try {
    const parsed = JSON.parse(await readFile(rulesPath(), 'utf8')) as Partial<PrivacyRules>
    return { ...DEFAULT_RULES, ...parsed }
  } catch {
    return { ...DEFAULT_RULES }
  }
}

export async function saveRules(rules: PrivacyRules): Promise<void> {
  const target = rulesPath()
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, JSON.stringify(rules, null, 2), 'utf8')
}

export type { CleanupReport } from '@shared/types'
type CleanupReport = import('@shared/types').CleanupReport

/**
 * Dry run over saved history so the user can see exactly which sites the
 * current rules would forget — and confirm nothing they care about is in it —
 * before anything is deleted.
 */
export async function previewCleanup(rules: PrivacyRules): Promise<PrivacyPreview> {
  const state = await loadApp()
  const hosts = new Set<string>()
  for (const ws of state?.workspaces ?? []) {
    for (const panel of Object.values(ws.panels)) {
      for (const tab of panel.tabs) {
        const h = hostOf(tab.url)
        if (h) hosts.add(h)
      }
    }
  }
  const { forget, keep } = partitionHosts([...hosts], rules)
  return { forget: forget.sort(), keep: keep.sort() }
}

/** Every panel session partition that currently exists in the saved workspace. */
function partitionsOf(state: AppState | null): string[] {
  if (!state) return []
  const ids = new Set<string>()
  for (const ws of state.workspaces) for (const pid of Object.keys(ws.panels)) ids.add(pid)
  return [...ids].map((id) => `persist:panel-${id}`)
}

/**
 * Clear cookies + site storage for every host matching the forget rules, across
 * all panel sessions, then strip matching URLs out of the saved workspace.
 * Everything not matched is left untouched.
 */
export async function runCleanup(rules: PrivacyRules): Promise<CleanupReport> {
  const report: CleanupReport = { hosts: [], cookiesRemoved: 0, tabsRemoved: 0 }
  if (!rules.enabled) return report

  const state = await loadApp()
  const forgotten = new Set<string>()

  for (const partition of partitionsOf(state)) {
    const ses = session.fromPartition(partition)

    // Cookies: inspect each one and drop only those whose domain matches.
    let cookies: Electron.Cookie[] = []
    try {
      cookies = await ses.cookies.get({})
    } catch {
      continue
    }
    for (const c of cookies) {
      const host = (c.domain ?? '').replace(/^\./, '').toLowerCase().replace(/^www\./, '')
      if (!shouldForget(host, rules)) continue
      const url = `${c.secure ? 'https' : 'http'}://${(c.domain ?? '').replace(/^\./, '')}${c.path ?? '/'}`
      try {
        await ses.cookies.remove(url, c.name)
        report.cookiesRemoved++
        forgotten.add(host)
      } catch {
        /* cookie already gone */
      }
    }

    // Site storage (localStorage, IndexedDB, service workers, cache storage)
    // for the same hosts, scoped per-origin so nothing else is touched.
    for (const host of [...forgotten]) {
      for (const scheme of ['https', 'http']) {
        try {
          await ses.clearStorageData({
            origin: `${scheme}://${host}`,
            storages: ['cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
          })
        } catch {
          /* nothing stored for this origin */
        }
      }
    }
  }

  // History: drop saved tabs pointing at forgotten hosts.
  if (rules.clearHistory && state) {
    let changed = false
    for (const ws of state.workspaces) {
      const panels: Record<string, PanelState> = {}
      for (const [pid, panel] of Object.entries(ws.panels)) {
        const kept = panel.tabs.filter((t) => {
          const host = hostOf(t.url)
          const drop = shouldForget(host, rules)
          if (drop) {
            forgotten.add(host)
            report.tabsRemoved++
            changed = true
          }
          return !drop
        })
        // A panel must always have at least one tab.
        panels[pid] =
          kept.length > 0
            ? { ...panel, tabs: kept, activeTabId: kept.some((t) => t.id === panel.activeTabId) ? panel.activeTabId : kept[0].id }
            : {
                ...panel,
                tabs: [
                  {
                    id: `${pid}::fresh`,
                    url: 'about:blank',
                    title: 'New Tab',
                    canGoBack: false,
                    canGoForward: false,
                    isLoading: false,
                    status: 'sleeping'
                  }
                ],
                activeTabId: `${pid}::fresh`
              }
      }
      ws.panels = panels
    }
    if (changed) await saveApp(state)
  }

  report.hosts = [...forgotten].sort()
  return report
}
