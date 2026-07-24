import { useWorkspace } from '../store/workspaceStore'
import type { SplitEdge } from '../layout/tree'

/**
 * Overlay shown while a panel is being dragged. Native views are hidden during
 * the drag (see beginPanelDrag), so this DOM layer is fully visible. It renders
 * the edge drop indicator and a cursor-following chip. `pointer-events-none` so
 * the drag's window listeners keep receiving moves.
 */
export function PanelDragLayer(): JSX.Element | null {
  const draggingPanelId = useWorkspace((s) => s.draggingPanelId)
  const dropTarget = useWorkspace((s) => s.dropTarget)
  const dragPos = useWorkspace((s) => s.dragPos)
  const title = useWorkspace((s) => {
    const p = draggingPanelId ? s.panels[draggingPanelId] : undefined
    return p?.tabs.find((t) => t.id === p.activeTabId)?.title ?? 'Panel'
  })

  if (!draggingPanelId) return null

  const indicator = dropTarget ? indicatorRect(dropTarget.panelId, dropTarget.edge) : null

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {indicator && (
        <div
          className="absolute rounded-lg border-2 border-accent bg-accent/20 transition-all duration-75"
          style={indicator}
        />
      )}
      {dragPos && (dragPos.x !== 0 || dragPos.y !== 0) && (
        <div
          className="absolute max-w-[220px] truncate rounded-md border border-accent/50 bg-surface-raised px-2.5 py-1 text-xs text-slate-100 shadow-xl"
          style={{ left: dragPos.x + 14, top: dragPos.y + 14 }}
        >
          {title}
        </div>
      )}
    </div>
  )
}

function indicatorRect(panelId: string, edge: SplitEdge): React.CSSProperties | null {
  const el = document.querySelector<HTMLElement>(`[data-panel-id="${CSS.escape(panelId)}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  const half = { w: r.width / 2, h: r.height / 2 }
  switch (edge) {
    case 'left':
      return { left: r.left, top: r.top, width: half.w, height: r.height }
    case 'right':
      return { left: r.left + half.w, top: r.top, width: half.w, height: r.height }
    case 'top':
      return { left: r.left, top: r.top, width: r.width, height: half.h }
    case 'bottom':
      return { left: r.left, top: r.top + half.h, width: r.width, height: half.h }
  }
}
