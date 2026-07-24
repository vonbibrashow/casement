import type { LayoutNode, SplitDirection, SplitNode } from '@shared/types'

// Pure, immutable operations over the binary layout tree. No React, no IPC —
// this is the "layout-engine" package from the spec, kept side-effect free so
// it is trivially testable.

export function newPanelId(): string {
  return `panel-${crypto.randomUUID()}`
}

/** All panel ids present in the tree, left-to-right / top-to-bottom. */
export function panelIds(node: LayoutNode): string[] {
  if (node.type === 'panel') return [node.id]
  return [...panelIds(node.children[0]), ...panelIds(node.children[1])]
}

export function countPanels(node: LayoutNode): number {
  return panelIds(node).length
}

export type SplitEdge = 'left' | 'right' | 'top' | 'bottom'

const edgeConfig: Record<SplitEdge, { direction: SplitDirection; before: boolean }> = {
  left: { direction: 'row', before: true },
  right: { direction: 'row', before: false },
  top: { direction: 'column', before: true },
  bottom: { direction: 'column', before: false }
}

/**
 * Replace panel `targetId` with a split that puts a fresh panel on the given
 * edge. Returns a new tree (structural sharing elsewhere).
 */
export function splitPanel(node: LayoutNode, targetId: string, edge: SplitEdge, newId: string): LayoutNode {
  if (node.type === 'panel') {
    if (node.id !== targetId) return node
    const { direction, before } = edgeConfig[edge]
    const fresh: LayoutNode = { type: 'panel', id: newId }
    const children: [LayoutNode, LayoutNode] = before ? [fresh, node] : [node, fresh]
    return { type: 'split', direction, children, sizes: [0.5, 0.5] }
  }
  return {
    ...node,
    children: [splitPanel(node.children[0], targetId, edge, newId), splitPanel(node.children[1], targetId, edge, newId)]
  }
}

/** Remove a panel, collapsing any split left with a single child. */
export function removePanel(node: LayoutNode, targetId: string): LayoutNode | null {
  if (node.type === 'panel') return node.id === targetId ? null : node
  const left = removePanel(node.children[0], targetId)
  const right = removePanel(node.children[1], targetId)
  if (left && right) return { ...node, children: [left, right] }
  return left ?? right ?? null
}

/** Set the sizes of the split node at `path` (array of 0|1 from the root). */
export function resizeAt(node: LayoutNode, path: number[], sizes: [number, number]): LayoutNode {
  if (path.length === 0) {
    if (node.type !== 'split') return node
    return { ...node, sizes }
  }
  if (node.type !== 'split') return node
  const [head, ...rest] = path
  const children: [LayoutNode, LayoutNode] = [...node.children]
  children[head] = resizeAt(node.children[head], rest, sizes) as LayoutNode
  return { ...node, children }
}

/**
 * Build a balanced preset layout for `count` panels (1, 2, or 4), reusing the
 * provided panel ids in order. Missing ids must be created by the caller.
 */
export function buildPreset(count: 1 | 2 | 4, ids: string[]): LayoutNode {
  const p = (i: number): LayoutNode => ({ type: 'panel', id: ids[i] })
  const split = (direction: SplitDirection, a: LayoutNode, b: LayoutNode): SplitNode => ({
    type: 'split',
    direction,
    children: [a, b],
    sizes: [0.5, 0.5]
  })
  switch (count) {
    case 1:
      return p(0)
    case 2:
      return split('row', p(0), p(1))
    case 4:
      // 2×2 grid: two columns, each split top/bottom.
      return split('row', split('column', p(0), p(1)), split('column', p(2), p(3)))
  }
}
