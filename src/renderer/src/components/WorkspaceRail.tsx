import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../store/workspaceStore'
import { panelIds } from '../layout/tree'
import { TEMPLATES } from '../templates'
import { pluginHost } from '../plugins/host'

/**
 * Far-left activity rail — one icon per workspace, VS Code / Obsidian style.
 *
 * Renders nothing when the switcher has been moved into the top bar, which
 * already shows the active workspace and so makes this a duplicate.
 */
export function WorkspaceRail(): JSX.Element | null {
  const workspaces = useWorkspace((s) => s.workspaces)
  const activeId = useWorkspace((s) => s.activeWorkspaceId)
  const switchWorkspace = useWorkspace((s) => s.switchWorkspace)
  const createWorkspace = useWorkspace((s) => s.createWorkspace)
  const updateSettings = useWorkspace((s) => s.updateSettings)
  const openSettings = useWorkspace((s) => s.openSettings)
  const inToolbar = useWorkspace((s) => (s.settings?.workspaceSwitcher ?? 'rail') === 'toolbar')
  const autoHide = useWorkspace((s) => s.settings?.autoHideRail ?? false)
  const pinned = useWorkspace((s) => s.settings?.railPinned ?? false)

  const [menuOpen, setMenuOpen] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = (): void => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setRevealed(true)
  }
  const scheduleHide = (): void => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setRevealed(false), 350)
  }
  useEffect(() => () => void (hideTimer.current && clearTimeout(hideTimer.current)), [])

  // The new-workspace menu overlaps the panel area, where native views paint
  // above the DOM — hide them while it's open.
  useEffect(() => {
    if (!menuOpen) return
    const ids = panelIds(useWorkspace.getState().layout)
    ids.forEach((id) => void window.workspace.setPanelVisible(id, false))
    return () => panelIds(useWorkspace.getState().layout).forEach((id) => void window.workspace.setPanelVisible(id, true))
  }, [menuOpen])

  if (inToolbar) return null

  const visible = !autoHide || revealed || pinned || menuOpen

  /** Native right-click menu — floats above the panels' WebContentsViews. */
  const onContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    show()
    void window.workspace.showRailMenu(pinned).then((action) => {
      if (action === 'toggle-pin') void updateSettings({ railPinned: !pinned })
      else if (action === 'new-workspace') createWorkspace()
      else if (action === 'move-to-toolbar') void updateSettings({ workspaceSwitcher: 'toolbar' })
      else if (action === 'settings') openSettings()
      if (autoHide) scheduleHide()
    })
  }

  if (!visible) {
    return (
      <div
        onPointerEnter={show}
        onContextMenu={onContextMenu}
        title="Show workspaces — right-click for options"
        className="group flex w-1.5 shrink-0 cursor-pointer flex-col items-center justify-center border-r border-surface-border bg-surface-border/60 hover:bg-accent/70"
      >
        <span className="h-8 w-[2px] rounded-full bg-slate-600 group-hover:bg-white/70" />
      </div>
    )
  }

  return (
    <nav
      onPointerEnter={autoHide ? show : undefined}
      onPointerLeave={autoHide ? scheduleHide : undefined}
      onContextMenu={onContextMenu}
      className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-surface-border bg-surface-sunken py-3"
    >
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

      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          title="New workspace"
          className={`mt-1 flex h-10 w-10 items-center justify-center rounded-xl border border-dashed text-slate-500 hover:border-accent/70 hover:text-white ${
            menuOpen ? 'border-accent/70 text-white' : 'border-surface-border'
          }`}
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7}>
            <path d="M10 4v12M4 10h12" strokeLinecap="round" />
          </svg>
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute bottom-0 left-12 z-50 w-52 overflow-hidden rounded-lg border border-surface-border bg-surface p-1 shadow-2xl">
              <MenuItem
                onClick={() => {
                  createWorkspace()
                  setMenuOpen(false)
                }}
                icon="＋"
                label="Blank workspace"
              />
              <div className="my-1 h-px bg-surface-border" />
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-500">Templates</div>
              {[...TEMPLATES, ...pluginHost.getTemplates()].map((t) => (
                <MenuItem
                  key={t.id}
                  onClick={() => {
                    createWorkspace(t)
                    setMenuOpen(false)
                  }}
                  icon={t.icon}
                  label={t.name}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </nav>
  )
}

function MenuItem({ onClick, icon, label }: { onClick: () => void; icon: string; label: string }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-surface-raised hover:text-white"
    >
      <span className="w-4 text-center text-sm leading-none">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}
