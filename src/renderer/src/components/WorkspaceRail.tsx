import { useWorkspace } from '../store/workspaceStore'

/** Far-left activity rail — one icon per workspace, VS Code / Obsidian style. */
export function WorkspaceRail(): JSX.Element {
  const workspaces = useWorkspace((s) => s.workspaces)
  const activeId = useWorkspace((s) => s.activeWorkspaceId)
  const switchWorkspace = useWorkspace((s) => s.switchWorkspace)
  const createWorkspace = useWorkspace((s) => s.createWorkspace)

  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-surface-border bg-surface-sunken py-3">
      {workspaces.map((ws) => {
        const active = ws.id === activeId
        return (
          <button
            key={ws.id}
            onClick={() => switchWorkspace(ws.id)}
            title={ws.name}
            className={`relative flex h-10 w-10 items-center justify-center rounded-xl text-lg transition ${
              active ? 'bg-surface-raised ring-1 ring-accent/70' : 'grayscale hover:bg-surface-raised hover:grayscale-0'
            }`}
          >
            {active && <span className="absolute -left-2 h-5 w-1 rounded-full bg-accent" />}
            <span className="leading-none">{ws.icon}</span>
          </button>
        )
      })}

      <button
        onClick={createWorkspace}
        title="New workspace"
        className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-surface-border text-slate-500 hover:border-accent/70 hover:text-white"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7}>
          <path d="M10 4v12M4 10h12" strokeLinecap="round" />
        </svg>
      </button>
    </nav>
  )
}
