import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { useWorkspace } from '../store/workspaceStore'
import type { SplitEdge } from '../layout/tree'
import { TabStrip } from './TabStrip'

export function PanelFrame({ id }: { id: string }): JSX.Element {
  const panel = useWorkspace((s) => s.panels[id])
  const focused = useWorkspace((s) => s.focusedPanelId === id)
  const layout = useWorkspace((s) => s.layout) // re-measure whenever layout changes
  const canClose = useWorkspace((s) => Object.keys(s.panels).length > 1)

  const navigate = useWorkspace((s) => s.navigate)
  const back = useWorkspace((s) => s.back)
  const forward = useWorkspace((s) => s.forward)
  const reload = useWorkspace((s) => s.reload)
  const stop = useWorkspace((s) => s.stop)
  const split = useWorkspace((s) => s.split)
  const closePanel = useWorkspace((s) => s.closePanel)
  const focusPanel = useWorkspace((s) => s.focusPanel)

  const viewportRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')

  const activeTab = panel?.tabs.find((t) => t.id === panel.activeTabId) ?? panel?.tabs[0]

  // Keep the URL bar in sync with the active tab unless the user is editing it.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(activeTab?.url ?? '')
  }, [activeTab?.id, activeTab?.url])

  // Report this panel's viewport rectangle to main so the active tab's native
  // WebContentsView is positioned exactly over it.
  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = (): void => {
      const r = el.getBoundingClientRect()
      void window.workspace.setPanelBounds(id, { x: r.left, y: r.top, width: r.width, height: r.height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [id, layout])

  if (!panel || !activeTab) return <div className="h-full w-full bg-surface-sunken" />

  const tabId = activeTab.id
  const submit = (e: FormEvent): void => {
    e.preventDefault()
    navigate(id, tabId, draft)
    inputRef.current?.blur()
  }

  return (
    <div
      onPointerDownCapture={() => focusPanel(id)}
      className={`flex h-full w-full flex-col overflow-hidden rounded-md border bg-surface ${
        focused ? 'border-accent/60' : 'border-surface-border'
      }`}
    >
      <TabStrip panelId={id} />

      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-surface-border px-1.5">
        <IconButton label="Back" disabled={!activeTab.canGoBack} onClick={() => back(id, tabId)}>
          <path d="M12.5 15l-5-5 5-5" />
        </IconButton>
        <IconButton label="Forward" disabled={!activeTab.canGoForward} onClick={() => forward(id, tabId)}>
          <path d="M7.5 5l5 5-5 5" />
        </IconButton>
        <IconButton
          label={activeTab.isLoading ? 'Stop' : 'Reload'}
          onClick={() => (activeTab.isLoading ? stop(id, tabId) : reload(id, tabId))}
        >
          {activeTab.isLoading ? (
            <path d="M6 6l8 8M14 6l-8 8" />
          ) : (
            <path d="M15 10a5 5 0 1 1-1.5-3.5M15 4v3h-3" />
          )}
        </IconButton>

        <form onSubmit={submit} className="min-w-0 flex-1">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            spellCheck={false}
            placeholder="Search or enter address"
            className="w-full select-text rounded-md bg-surface-sunken px-2.5 py-1 text-xs text-slate-200 outline-none ring-accent/50 placeholder:text-slate-600 focus:ring-1"
          />
        </form>

        <div className="flex items-center gap-0.5 pl-0.5">
          <SplitButton edge="left" onClick={() => split(id, 'left')} />
          <SplitButton edge="right" onClick={() => split(id, 'right')} />
          <SplitButton edge="top" onClick={() => split(id, 'top')} />
          <SplitButton edge="bottom" onClick={() => split(id, 'bottom')} />
          <button
            onClick={() => closePanel(id)}
            disabled={!canClose}
            title="Close panel"
            className="ml-0.5 flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-25 disabled:hover:bg-transparent"
          >
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* The active tab's native WebContentsView is positioned over this region. */}
      <div ref={viewportRef} className="panel-viewport min-h-0 flex-1" />
    </div>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  children
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="flex h-6 w-6 items-center justify-center rounded text-slate-300 hover:bg-surface-raised disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  )
}

const edgeGlyph: Record<SplitEdge, JSX.Element> = {
  left: <rect x="3.5" y="4" width="5" height="12" rx="1" />,
  right: <rect x="11.5" y="4" width="5" height="12" rx="1" />,
  top: <rect x="4" y="3.5" width="12" height="5" rx="1" />,
  bottom: <rect x="4" y="11.5" width="12" height="5" rx="1" />
}

function SplitButton({ edge, onClick }: { edge: SplitEdge; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={`Split ${edge}`}
      className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-surface-raised hover:text-accent"
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.4}>
        <rect x="3.5" y="3.5" width="13" height="13" rx="2" className="opacity-40" />
        {edgeGlyph[edge]}
      </svg>
    </button>
  )
}
