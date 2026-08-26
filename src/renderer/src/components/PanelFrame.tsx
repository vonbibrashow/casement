import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useWorkspace, type DropTarget } from '../store/workspaceStore'
import { panelIds, type SplitEdge } from '../layout/tree'
import { TabStrip } from './TabStrip'

/** Find which panel (other than the dragged one) the cursor is over + which edge. */
function hitTestPanels(x: number, y: number, sourceId: string): DropTarget | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-panel-id]'))) {
    const pid = el.dataset.panelId
    if (!pid || pid === sourceId) continue
    const r = el.getBoundingClientRect()
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue
    const fx = (x - r.left) / r.width
    const fy = (y - r.top) / r.height
    const dists: Array<[SplitEdge, number]> = [
      ['left', fx],
      ['right', 1 - fx],
      ['top', fy],
      ['bottom', 1 - fy]
    ]
    let best = dists[0]
    for (const d of dists) if (d[1] < best[1]) best = d
    return { panelId: pid, edge: best[0] }
  }
  return null
}

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
  const addTab = useWorkspace((s) => s.addTab)
  const setFocusedPanel = useWorkspace((s) => s.setFocusedPanel)
  const openShare = useWorkspace((s) => s.openShare)
  const isShared = useWorkspace((s) => s.shares.some((x) => x.panelId === id))
  const beginPanelDrag = useWorkspace((s) => s.beginPanelDrag)
  const updatePanelDrag = useWorkspace((s) => s.updatePanelDrag)
  const endPanelDrag = useWorkspace((s) => s.endPanelDrag)

  const viewportRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')
  // Below this width the four split buttons + close would crowd out the address
  // bar and tabs, so they collapse into an overflow menu.
  const [compact, setCompact] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // Auto-hide: the chrome collapses to a thin strip until the top edge is
  // hovered. It can't reveal on hovering the page itself — the native
  // WebContentsView paints above the DOM and swallows those pointer events —
  // so the strip stays live as the trigger surface.
  const autoHide = useWorkspace((s) => s.settings?.autoHideChrome ?? false)
  const [revealed, setRevealed] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showChrome = (): void => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setRevealed(true)
  }
  /** Small delay so crossing a gap on the way to a button doesn't collapse it. */
  const scheduleHide = (): void => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setRevealed(false), 350)
  }
  useEffect(() => () => void (hideTimer.current && clearTimeout(hideTimer.current)), [])

  const pinned = useWorkspace((s) => s.panels[id]?.chromePinned ?? false)
  const togglePin = useWorkspace((s) => s.togglePanelChromePin)

  // Never collapse out from under an open menu, a focused address bar, or a
  // bar the user has explicitly pinned.
  const chromeVisible = !autoHide || revealed || menuOpen || pinned

  /** Native right-click menu — floats above the panel's WebContentsView. */
  const onContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    showChrome() // hold it open while the menu is up
    void window.workspace.showPanelChromeMenu(pinned, canClose).then((action) => {
      switch (action) {
        case 'toggle-pin':
          togglePin(id)
          break
        case 'new-tab':
          addTab(id)
          break
        case 'split-right':
          split(id, 'right')
          break
        case 'split-down':
          split(id, 'bottom')
          break
        case 'close-panel':
          closePanel(id)
          break
      }
      if (autoHide) scheduleHide()
    })
  }

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 620))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The menu drops over the viewport, where the native view paints above the
  // DOM — hide panels while it's open (same pattern as the palette).
  useEffect(() => {
    if (!menuOpen) return
    const ids = panelIds(useWorkspace.getState().layout)
    ids.forEach((p) => void window.workspace.setPanelVisible(p, false))
    return () => panelIds(useWorkspace.getState().layout).forEach((p) => void window.workspace.setPanelVisible(p, true))
  }, [menuOpen])

  const activeTab = panel?.tabs.find((t) => t.id === panel.activeTabId) ?? panel?.tabs[0]

  // Keep the URL bar in sync with the active tab unless the user is editing it.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(activeTab?.url ?? '')
  }, [activeTab?.id, activeTab?.url])

  // Respond to the "Focus Address Bar" command (Ctrl+L / palette).
  useEffect(() => {
    const onFocusUrl = (e: Event): void => {
      if ((e as CustomEvent<string>).detail === id) {
        // Ctrl+L must work even when the bar is hidden — reveal, then focus
        // once it has rendered.
        showChrome()
        requestAnimationFrame(() => {
          inputRef.current?.focus()
          inputRef.current?.select()
        })
      }
    }
    window.addEventListener('mb:focus-url', onFocusUrl)
    return () => window.removeEventListener('mb:focus-url', onFocusUrl)
  }, [id])

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

  const startPanelDrag = (e: ReactPointerEvent): void => {
    e.preventDefault()
    beginPanelDrag(id)
    const move = (ev: PointerEvent): void =>
      updatePanelDrag({ x: ev.clientX, y: ev.clientY }, hitTestPanels(ev.clientX, ev.clientY, id))
    const stop = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', onKey)
    }
    const up = (): void => {
      stop()
      endPanelDrag()
    }
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') {
        updatePanelDrag({ x: 0, y: 0 }, null)
        up()
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', onKey)
  }

  return (
    <div
      ref={rootRef}
      data-panel-id={id}
      onPointerDownCapture={() => setFocusedPanel(id)}
      className={`flex h-full w-full flex-col overflow-hidden rounded-md border bg-surface ${
        focused ? 'border-accent/60' : 'border-surface-border'
      }`}
    >
      {/* Collapsed trigger. Stays in the DOM above the native view so it can
          still receive the hover that brings the chrome back. */}
      {!chromeVisible && (
        <div
          onPointerEnter={showChrome}
          onContextMenu={onContextMenu}
          title="Show tabs and address bar — right-click for options"
          className="group flex h-1.5 shrink-0 cursor-pointer items-center justify-center bg-surface-border/60 hover:bg-accent/70"
        >
          <span className="h-[2px] w-8 rounded-full bg-slate-600 group-hover:bg-white/70" />
        </div>
      )}

      {/* One chrome row: nav + address bar + tabs + panel controls. */}
      <div
        onPointerEnter={autoHide ? showChrome : undefined}
        onPointerLeave={autoHide ? scheduleHide : undefined}
        onContextMenu={onContextMenu}
        className={`flex h-9 shrink-0 items-center gap-1 border-b border-surface-border px-1.5 ${chromeVisible ? '' : 'hidden'}`}
      >
        {canClose && (
          <button
            onPointerDown={startPanelDrag}
            title="Drag to move panel"
            className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-slate-600 hover:text-slate-300 active:cursor-grabbing"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <circle cx="7.5" cy="5" r="1.2" />
              <circle cx="12.5" cy="5" r="1.2" />
              <circle cx="7.5" cy="10" r="1.2" />
              <circle cx="12.5" cy="10" r="1.2" />
              <circle cx="7.5" cy="15" r="1.2" />
              <circle cx="12.5" cy="15" r="1.2" />
            </svg>
          </button>
        )}
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

        <form onSubmit={submit} className="min-w-[120px] max-w-[460px] flex-[1_1_190px]">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => {
              showChrome()
              e.target.select()
            }}
            onBlur={autoHide ? scheduleHide : undefined}
            spellCheck={false}
            placeholder="Search or enter address"
            className="w-full select-text rounded-md bg-surface-sunken px-2.5 py-1 text-xs text-slate-200 outline-none ring-accent/50 placeholder:text-slate-600 focus:ring-1"
          />
        </form>

        <div className="mx-0.5 h-5 w-px shrink-0 bg-surface-border" />

        <TabStrip panelId={id} />

        <div className="flex shrink-0 items-center gap-0.5 pl-0.5">
          <button
            onClick={() => void openShare(id)}
            title={isShared ? 'Sharing — manage guests' : 'Share this panel'}
            className={`flex h-6 w-6 items-center justify-center rounded ${
              isShared ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:bg-surface-raised hover:text-accent'
            }`}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="6" cy="10" r="2" />
              <circle cx="14" cy="5.5" r="2" />
              <circle cx="14" cy="14.5" r="2" />
              <path d="M7.8 9l4.4-2.5M7.8 11l4.4 2.5" strokeLinecap="round" />
            </svg>
          </button>
          {compact ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                title="Panel actions"
                className={`flex h-6 w-6 items-center justify-center rounded ${
                  menuOpen ? 'bg-surface-raised text-white' : 'text-slate-400 hover:bg-surface-raised hover:text-white'
                }`}
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                  <circle cx="4.5" cy="10" r="1.4" />
                  <circle cx="10" cy="10" r="1.4" />
                  <circle cx="15.5" cy="10" r="1.4" />
                </svg>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onPointerDown={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-7 z-50 w-40 overflow-hidden rounded-lg border border-surface-border bg-surface p-1 shadow-2xl">
                    {(['left', 'right', 'top', 'bottom'] as const).map((edge) => (
                      <button
                        key={edge}
                        onClick={() => {
                          setMenuOpen(false)
                          split(id, edge)
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-surface-raised hover:text-white"
                      >
                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.4}>
                          <rect x="3.5" y="3.5" width="13" height="13" rx="2" className="opacity-40" />
                          {edgeGlyph[edge]}
                        </svg>
                        Split {edge}
                      </button>
                    ))}
                    <div className="my-1 h-px bg-surface-border" />
                    <button
                      onClick={() => {
                        setMenuOpen(false)
                        closePanel(id)
                      }}
                      disabled={!canClose}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.6}>
                        <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
                      </svg>
                      Close panel
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
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
            </>
          )}
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
