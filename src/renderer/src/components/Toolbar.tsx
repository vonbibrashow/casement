import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useWorkspace } from '../store/workspaceStore'
import { countPanels } from '../layout/tree'

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
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
          autosaved
        </span>
      </div>
    </header>
  )
}
