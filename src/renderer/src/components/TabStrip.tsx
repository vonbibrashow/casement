import type { MouseEvent } from 'react'
import { useWorkspace } from '../store/workspaceStore'

/** The row of tabs at the top of a panel. */
export function TabStrip({ panelId }: { panelId: string }): JSX.Element {
  const panel = useWorkspace((s) => s.panels[panelId])
  const activateTab = useWorkspace((s) => s.activateTab)
  const closeTab = useWorkspace((s) => s.closeTab)
  const addTab = useWorkspace((s) => s.addTab)

  if (!panel) return <div className="h-8 border-b border-surface-border bg-surface-raised" />

  return (
    <div className="flex h-8 shrink-0 items-stretch gap-1 border-b border-surface-border bg-surface-raised px-1">
      <div className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto py-1">
        {panel.tabs.map((tab) => {
          const active = tab.id === panel.activeTabId
          return (
            <div
              key={tab.id}
              onPointerDown={() => activateTab(panelId, tab.id)}
              onAuxClick={(e: MouseEvent) => {
                if (e.button === 1) closeTab(panelId, tab.id) // middle-click closes
              }}
              title={tab.title || tab.url}
              className={`group flex min-w-[92px] max-w-[180px] cursor-default items-center gap-1.5 rounded-md px-2 text-xs ${
                active
                  ? 'bg-surface text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:bg-surface/60 hover:text-slate-200'
              }`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tab.isLoading ? 'bg-accent animate-pulse' : 'bg-slate-600'}`} />
              <span className="min-w-0 flex-1 truncate">{tab.title || 'New Tab'}</span>
              <button
                onPointerDown={(e) => {
                  e.stopPropagation()
                  closeTab(panelId, tab.id)
                }}
                title="Close tab"
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-500 opacity-0 hover:bg-red-500/25 hover:text-red-300 group-hover:opacity-100"
              >
                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.6}>
                  <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>
      <button
        onClick={() => addTab(panelId)}
        title="New tab"
        className="my-1 flex w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-surface hover:text-white"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6}>
          <path d="M10 4v12M4 10h12" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
