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

/**
 * Performance state of a tab (realizes the panel Live/Paused/Sleeping modes at
 * tab granularity):
 * - `live`     — the active tab of its panel: rendering, JS running.
 * - `paused`   — a background tab kept warm; hidden, so Chromium throttles it.
 * - `sleeping` — unloaded from memory (no WebContentsView); reloads on activate.
 */
export type TabStatus = 'live' | 'paused' | 'sleeping'

/** A single tab: one Chromium WebContentsView (unless sleeping). */
export interface TabState {
  id: string
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
  status: TabStatus
}

/** A panel: an ordered set of tabs with one active. */
export interface PanelState {
  id: string
  tabs: TabState[]
  activeTabId: string
}

/** One saved workspace — a named layout + its panels/tabs. */
export interface WorkspaceDoc {
  id: string
  name: string
  /** Short display glyph (emoji) shown in the workspace rail. */
  icon: string
  layout: LayoutNode
  panels: Record<string, PanelState>
  focusedPanelId: string | null
}

/** Lightweight workspace identity for the switcher (no panel data). */
export interface WorkspaceMeta {
  id: string
  name: string
  icon: string
}

/** The full serializable app state — every workspace + which one is active. */
export interface AppState {
  version: 3
  workspaces: WorkspaceDoc[]
  activeWorkspaceId: string
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
