import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useWorkspace } from '../store/workspaceStore'
import { countPanels } from '../layout/tree'

/** "just now" / "2m ago" / "1h ago" — enough precision for a save clock. */
function agoLabel(ts: number, now: number): string {
  const secs = Math.max(0, Math.round((now - ts) / 1000))
  if (secs < 45) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.round(mins / 60)}h ago`
}

/**
 * Reports the actual state of the workspace autosave. Deliberately capable of
 * showing failure — a status light that can only ever be green is worse than
 * none, because a silently failed write would look like a healthy one.
 */
function SaveIndicator(): JSX.Element {
  const state = useWorkspace((s) => s.saveState)
  const lastSavedAt = useWorkspace((s) => s.lastSavedAt)
  const error = useWorkspace((s) => s.saveError)
  const [now, setNow] = useState(() => Date.now())

  // Keep the relative time honest without re-rendering constantly.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000)
    return () => clearInterval(t)
  }, [])

  if (state === 'error') {
    return (
      <span
        className="flex items-center gap-1 text-amber-300"
        title={`Your workspace could not be saved: ${error ?? 'unknown error'}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        save failed
      </span>
    )
  }
  if (state === 'saving') {
    return (
      <span className="flex items-center gap-1" title="Writing your workspace to disk">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        saving…
      </span>
    )
  }
  if (state === 'saved' && lastSavedAt) {
    return (
      <span className="flex items-center gap-1" title="Panels, tabs and layout are written to disk automatically">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
        saved {agoLabel(lastSavedAt, now)}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-slate-600" title="Changes are saved automatically">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
      autosave on
    </span>
  )
}

/** Global chrome: active-workspace name (rename/delete) + layout presets. */
export function Toolbar(): JSX.Element {
  const workspaces = useWorkspace((s) => s.workspaces)
  const activeId = useWorkspace((s) => s.activeWorkspaceId)
  const renameWorkspace = useWorkspace((s) => s.renameWorkspace)
  const deleteWorkspace = useWorkspace((s) => s.deleteWorkspace)
  const applyPreset = useWorkspace((s) => s.applyPreset)
  const panels = useWorkspace((s) => countPanels(s.layout))
  // Two primitive selectors (numbers) — returning an object here would hand
  // zustand a fresh reference every render and loop forever.
  const liveTabs = useWorkspace((s) => {
    let n = 0
    for (const p of Object.values(s.panels)) for (const t of p.tabs) if (t.status !== 'sleeping') n++
    return n
  })
  const asleepTabs = useWorkspace((s) => {
    let n = 0
    for (const p of Object.values(s.panels)) for (const t of p.tabs) if (t.status === 'sleeping') n++
    return n
  })

  const active = workspaces.find((w) => w.id === activeId)
  const canDelete = workspaces.length > 1

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const startEdit = (): void => {
    setDraft(active?.name ?? '')
    setEditing(true)
  }
  const commitEdit = (e?: FormEvent): void => {
    e?.preventDefault()
    if (active) renameWorkspace(active.id, draft)
    setEditing(false)
  }

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-surface-border bg-surface px-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-base leading-none">{active?.icon ?? '🗂️'}</span>
        {editing ? (
          <form onSubmit={commitEdit}>
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commitEdit()}
              onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
              className="w-40 rounded bg-surface-sunken px-1.5 py-0.5 text-[13px] font-semibold text-slate-100 outline-none ring-1 ring-accent/60"
            />
          </form>
        ) : (
          <button
            onDoubleClick={startEdit}
            title="Double-click to rename"
            className="truncate text-[13px] font-semibold tracking-tight text-slate-100 hover:text-white"
          >
            {active?.name ?? 'Workspace'}
          </button>
        )}
        <button
          onClick={startEdit}
          title="Rename workspace"
          className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-surface-raised hover:text-slate-200"
        >
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M13 4l3 3-8 8H5v-3z" strokeLinejoin="round" />
          </svg>
        </button>
        {canDelete && (
          <button
            onClick={() => active && deleteWorkspace(active.id)}
            title="Delete workspace"
            className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-red-500/20 hover:text-red-300"
          >
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M5 6h10M8 6V4h4v2M6 6l1 10h6l1-10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="mx-1 h-5 w-px bg-surface-border" />

      <div className="flex items-center gap-1">
        <span className="pr-1 text-[11px] uppercase tracking-wide text-slate-500">Layout</span>
        {([1, 2, 4] as const).map((n) => (
          <button
            key={n}
            onClick={() => applyPreset(n)}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-surface-raised hover:text-white active:scale-95"
            title={`${n} panel${n > 1 ? 's' : ''}`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2.5 text-[11px] text-slate-500">
        <span>
          {panels} panel{panels > 1 ? 's' : ''}
        </span>
        <span title="Loaded tabs (others are asleep to save memory)">
          {liveTabs} live{asleepTabs > 0 && <span className="text-slate-600"> · {asleepTabs} 💤</span>}
        </span>
        <SaveIndicator />
      </div>
    </header>
  )
}
