import { useEffect, useMemo, useState } from 'react'
import type { HistoryEntry } from '@shared/types'
import { useWorkspace } from '../store/workspaceStore'
import { panelIds } from '../layout/tree'

export function HistoryModal(): JSX.Element | null {
  const open = useWorkspace((s) => s.historyOpen)
  return open ? <ModalInner /> : null
}

/** Day buckets, so a long list stays scannable. */
function dayLabel(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86_400_000)
  const same = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

function ModalInner(): JSX.Element {
  const close = useWorkspace((s) => s.closeHistory)
  const addTab = useWorkspace((s) => s.addTab)
  const focusedPanelId = useWorkspace((s) => s.focusedPanelId)
  const firstPanelId = useWorkspace((s) => Object.keys(s.panels)[0])
  const historyEnabled = useWorkspace((s) => s.settings?.historyEnabled ?? true)

  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [confirmClear, setConfirmClear] = useState(false)

  const refresh = (q: string): void => {
    void window.workspace.listHistory(q).then(setEntries)
  }
  useEffect(() => refresh(query), [query])

  useEffect(() => {
    void window.workspace.focusChrome()
    const ids = panelIds(useWorkspace.getState().layout)
    ids.forEach((id) => void window.workspace.setPanelVisible(id, false))
    return () => panelIds(useWorkspace.getState().layout).forEach((id) => void window.workspace.setPanelVisible(id, true))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const grouped = useMemo(() => {
    const out: Array<{ label: string; items: HistoryEntry[] }> = []
    for (const e of entries) {
      const label = dayLabel(e.visitedAt)
      const last = out[out.length - 1]
      if (last?.label === label) last.items.push(e)
      else out.push({ label, items: [e] })
    }
    return out
  }, [entries])

  const openEntry = (url: string): void => {
    const target = focusedPanelId ?? firstPanelId
    if (target) addTab(target, url)
    close()
  }

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/50 pt-[7vh] backdrop-blur-sm" onPointerDown={close}>
      <div
        className="flex max-h-[82vh] w-[min(700px,94vw)] flex-col overflow-hidden rounded-xl border border-surface-border bg-surface shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-surface-border px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">History</h2>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search history…"
            spellCheck={false}
            className="ml-2 min-w-0 flex-1 rounded-md bg-surface-sunken px-2.5 py-1.5 text-xs text-slate-200 outline-none ring-accent/50 placeholder:text-slate-600 focus:ring-1"
          />
          <button onClick={close} className="rounded p-1 text-slate-500 hover:bg-surface-raised hover:text-slate-200">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {!historyEnabled && (
          <div className="border-b border-surface-border bg-amber-500/5 px-4 py-2 text-[11px] text-amber-200/80">
            History recording is turned off in Settings — nothing new is being saved.
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="px-4 py-12 text-center text-xs text-slate-500">
              {query ? 'Nothing matches that search.' : 'No history yet.'}
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.label}>
                <div className="sticky top-0 bg-surface/95 px-4 py-1.5 text-[10px] uppercase tracking-wide text-slate-500 backdrop-blur">
                  {group.label}
                </div>
                {group.items.map((e) => (
                  <div key={e.id} className="group flex items-center gap-3 px-4 py-1.5 hover:bg-surface-raised/50">
                    <button onClick={() => openEntry(e.url)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-xs text-slate-200">{e.title || e.url}</div>
                      <div className="truncate font-mono text-[10px] text-slate-600">{e.url}</div>
                    </button>
                    <span className="shrink-0 text-[10px] text-slate-600">
                      {new Date(e.visitedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      {e.visits > 1 && ` · ${e.visits}×`}
                    </span>
                    <button
                      onClick={() => void window.workspace.removeHistoryEntry(e.id).then(() => refresh(query))}
                      title="Remove"
                      className="shrink-0 rounded p-1 text-slate-600 opacity-0 hover:bg-red-500/20 hover:text-red-300 group-hover:opacity-100"
                    >
                      <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.8}>
                        <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-surface-border px-4 py-2.5">
          <span className="text-[11px] text-slate-500">{entries.length} shown</span>
          {confirmClear ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Clear all history?</span>
              <button
                onClick={() =>
                  void window.workspace.clearHistory().then(() => {
                    setConfirmClear(false)
                    refresh(query)
                  })
                }
                className="rounded-md bg-red-500/20 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-500/30"
              >
                Delete
              </button>
              <button onClick={() => setConfirmClear(false)} className="rounded-md px-2 py-1 text-xs text-slate-400 hover:text-slate-200">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="rounded-md bg-surface-raised px-2.5 py-1 text-xs text-slate-300 hover:bg-surface-border"
            >
              Clear history…
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
