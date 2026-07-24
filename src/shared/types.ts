// Shared domain types used across main, preload and renderer.
//
// The workspace is modelled as a tree of layout nodes. A node is either a
// single panel (a real Chromium browser) or a split containing two children.
// This binary-split model gives us 1 / 2 / 4 / N panel layouts and arbitrary
// drag-resizing for free.

export type SplitDirection = 'row' | 'column'

export interface PanelNode {
  type: 'panel'
  /** Stable id — also used to key the native WebContentsView and its session. */
  id: string
}

export interface SplitNode {
  type: 'split'
  direction: SplitDirection
  /** Exactly two children. Nesting produces 4/6/9/… layouts. */
  children: [LayoutNode, LayoutNode]
  /** Fractional sizes of each child along the split axis, summing to 1. */
  sizes: [number, number]
}

export type LayoutNode = PanelNode | SplitNode

/** Persisted, serializable state for a single panel. */
export interface PanelState {
  id: string
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
}

/** The full serializable workspace — everything needed to restore a session. */
export interface WorkspaceState {
  version: 1
  layout: LayoutNode
  panels: Record<string, PanelState>
  focusedPanelId: string | null
}

/** Pixel rectangle (CSS px === DIP at renderer zoom 1) for positioning a view. */
export interface PanelBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Runtime navigation update pushed from main → renderer for a panel. */
export interface PanelUpdate {
  id: string
  url?: string
  title?: string
  canGoBack?: boolean
  canGoForward?: boolean
  isLoading?: boolean
}

export const DEFAULT_URL = 'https://www.google.com'
