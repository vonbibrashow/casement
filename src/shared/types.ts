// Shared domain types used across main, preload and renderer.
//
// The workspace is a tree of layout nodes. A node is either a single panel or a
// split of two children. Each panel now owns one or more *tabs* — every tab is
// its own real Chromium WebContentsView. Tabs within a panel share the panel's
// session (like tabs in a browser window); panels remain isolated from one
// another.

export type SplitDirection = 'row' | 'column'

export interface PanelNode {
  type: 'panel'
  /** Stable id — also the session partition name for every tab in the panel. */
  id: string
}

export interface SplitNode {
  type: 'split'
  direction: SplitDirection
  children: [LayoutNode, LayoutNode]
  /** Fractional sizes of each child along the split axis, summing to 1. */
  sizes: [number, number]
}

export type LayoutNode = PanelNode | SplitNode

/** A single tab: one Chromium WebContentsView. */
export interface TabState {
  id: string
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
}

/** A panel: an ordered set of tabs with one active. */
export interface PanelState {
  id: string
  tabs: TabState[]
  activeTabId: string
}

/** The full serializable workspace — everything needed to restore a session. */
export interface WorkspaceState {
  version: 2
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

/** Runtime navigation update pushed from main → renderer for a single tab. */
export interface TabUpdate {
  panelId: string
  tabId: string
  url?: string
  title?: string
  canGoBack?: boolean
  canGoForward?: boolean
  isLoading?: boolean
}

export const DEFAULT_URL = 'https://www.google.com'
