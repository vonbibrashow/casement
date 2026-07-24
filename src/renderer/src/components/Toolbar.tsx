import { useWorkspace } from '../store/workspaceStore'
import { countPanels } from '../layout/tree'

/** Global workspace chrome: brand + layout presets. Panel-level controls live
 *  on each panel. Persistence is automatic (autosaved on every change). */
export function Toolbar(): JSX.Element {
  const applyPreset = useWorkspace((s) => s.applyPreset)
  const panels = useWorkspace((s) => countPanels(s.layout))

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-surface-border bg-surface px-3">
      <div className="flex items-center gap-2 pr-2">
        <div className="h-4 w-4 rounded-[5px] bg-accent shadow-[0_0_12px] shadow-accent/40" />
        <span className="text-[13px] font-semibold tracking-tight text-slate-100">Workspace</span>
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

      <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">
        <span>
          {panels} panel{panels > 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
          autosaved
        </span>
      </div>
    </header>
  )
}
