import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { LayoutNode, SplitNode } from '@shared/types'
import { useWorkspace } from '../store/workspaceStore'
import { PanelFrame } from './PanelFrame'

const DIVIDER = 6 // px
const MIN_FRACTION = 0.12

export function WorkspaceView(): JSX.Element {
  const layout = useWorkspace((s) => s.layout)
  return (
    <div className="absolute inset-0">
      <LayoutNodeView node={layout} path={[]} />
    </div>
  )
}

function LayoutNodeView({ node, path }: { node: LayoutNode; path: number[] }): JSX.Element {
  if (node.type === 'panel') return <PanelFrame id={node.id} />
  return <SplitView node={node} path={path} />
}

function SplitView({ node, path }: { node: SplitNode; path: number[] }): JSX.Element {
  const resizeSplit = useWorkspace((s) => s.resizeSplit)
  const containerRef = useRef<HTMLDivElement>(null)
  const isRow = node.direction === 'row'

  function onDividerDown(e: ReactPointerEvent): void {
    e.preventDefault()
    const el = containerRef.current
    if (!el) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    const move = (ev: PointerEvent): void => {
      const rect = el.getBoundingClientRect()
      const total = (isRow ? rect.width : rect.height) - DIVIDER
      const pos = isRow ? ev.clientX - rect.left : ev.clientY - rect.top
      let f = pos / total
      f = Math.min(1 - MIN_FRACTION, Math.max(MIN_FRACTION, f))
      resizeSplit(path, [f, 1 - f])
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div ref={containerRef} className={`flex h-full w-full ${isRow ? 'flex-row' : 'flex-col'}`}>
      <div className="min-h-0 min-w-0" style={{ flexGrow: node.sizes[0], flexBasis: 0 }}>
        <LayoutNodeView node={node.children[0]} path={[...path, 0]} />
      </div>

      <div
        onPointerDown={onDividerDown}
        className={`group relative shrink-0 bg-surface-border transition-colors hover:bg-accent/70 ${
          isRow ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize'
        }`}
        style={{ [isRow ? 'width' : 'height']: DIVIDER } as React.CSSProperties}
      />

      <div className="min-h-0 min-w-0" style={{ flexGrow: node.sizes[1], flexBasis: 0 }}>
        <LayoutNodeView node={node.children[1]} path={[...path, 1]} />
      </div>
    </div>
  )
}
