import type { MouseEvent } from 'react'
import { useWorkspace } from '../store/workspaceStore'

/**
 * The panel's tabs, rendered inline inside the panel's single chrome row
 * (alongside the address bar) so each panel only spends one row on chrome.
 */
export function TabStrip({ panelId }: { panelId: string }): JSX.Element | null {
  const panel = useWorkspace((s) => s.panels[panelId])
  const activateTab = useWorkspace((s) => s.activateTab)
  const closeTab = useWorkspace((s) => s.closeTab)
  const addTab = useWorkspace((s) => s.addTab)

  if (!panel) return null

  return (
    <div className="flex min-w-0 flex-[3] items-stretch gap-1">
      <div className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto">
        {panel.tabs.map((tab) => {
          const active = tab.id === panel.activeTabId
          return (
            <div
              key={tab.id}
              onPointerDown={() => activateTab(panelId, tab.id)}
              onAuxClick={(e: MouseEvent) => {
                if (e.button === 1) closeTab(panelId, tab.id) // middle-click closes
              }}
              title={`${tab.title || tab.url}${tab.status === 'sleeping' ? ' — sleeping' : ''}`}
              className={`group flex h-7 min-w-[76px] max-w-[150px] shrink-0 cursor-default items-center gap-1.5 self-center rounded-md px-2 text-xs ${
                active
                  ? 'bg-surface-raised text-slate-100 shadow-sm ring-1 ring-surface-border'
                  : tab.status === 'sleeping'
                    ? 'text-slate-500 opacity-60 hover:bg-surface-raised/60 hover:opacity-100'
                    : 'text-slate-400 hover:bg-surface-raised/60 hover:text-slate-200'
              }`}
            >
              {tab.status === 'sleeping' ? (
                <span className="shrink-0 text-[10px] leading-none" aria-label="sleeping">
                  💤
                </span>
              ) : (
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tab.isLoading ? 'bg-accent animate-pulse' : 'bg-slate-500'}`} />
              )}
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
        className="flex h-6 w-6 shrink-0 items-center justify-center self-center rounded text-slate-400 hover:bg-surface-raised hover:text-white"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6}>
          <path d="M10 4v12M4 10h12" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
