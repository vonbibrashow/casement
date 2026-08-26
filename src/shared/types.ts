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

/**
 * Outcome of a workspace write. Returned as a value rather than thrown so the
 * UI can report a failed save instead of silently claiming everything is fine.
 */
export interface SaveResult {
  ok: boolean
  error?: string
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

// --- settings ----------------------------------------------------------------

export type SearchEngine = 'google' | 'duckduckgo' | 'bing'

export interface AppSettings {
  /** Page a new tab opens on. */
  newTabUrl: string
  /** Where a non-URL typed into the address bar gets searched. */
  searchEngine: SearchEngine
  /** Collapse each panel's tabs + address bar until the top edge is hovered. */
  autoHideChrome: boolean
  /** Collapse the workspace toolbar until the window's top edge is hovered. */
  autoHideToolbar: boolean
  /** Block known tracking, analytics and ad hosts in every panel. */
  blockTrackers: boolean
  /** Upgrade plain http:// navigations to https:// where possible. */
  httpsUpgrade: boolean
  /** Sites may use the camera or microphone. Off blocks silently. */
  allowCameraMic: boolean
  /** Sites may read your location. */
  allowLocation: boolean
  /** Sites may raise desktop notifications. */
  allowNotifications: boolean
  /** Record visited pages. Off means nothing is written to history at all. */
  historyEnabled: boolean
  /** Days to keep history for; 0 keeps it until manually cleared. */
  historyRetentionDays: number
  /** Idle minutes before a background tab is unloaded to free memory. */
  sleepAfterMinutes: number
  /** Cap on simultaneously loaded tabs; the least-recently-used sleep first. */
  maxLiveTabs: number
}

// --- browsing history --------------------------------------------------------

export interface HistoryEntry {
  id: string
  url: string
  title: string
  /** Epoch ms of the most recent visit. */
  visitedAt: number
  /** How many times this URL has been visited. */
  visits: number
}

// --- updates -----------------------------------------------------------------

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'current' | 'downloading' | 'ready' | 'error' | 'unsupported'
  /** Version found, or the running version when already current. */
  version: string | null
  message: string | null
  percent: number
}

// --- third-party attribution -------------------------------------------------

export interface LicensePackage {
  name: string
  version: string
  license: string
  homepage: string
  text: string
}

export interface LicenseManifest {
  generatedAt: string
  runtime: { electron: string; chromium: string; note: string }
  packages: LicensePackage[]
}

// --- selective forget-on-exit ----------------------------------------------

/** Which sites get wiped at shutdown. Everything unmatched is preserved. */
export interface PrivacyRules {
  /** Master switch — nothing is cleared unless this is on. */
  enabled: boolean
  /** Match the built-in adult-content patterns. */
  clearAdult: boolean
  /** Extra domains the user wants forgotten (suffix match). */
  forgetDomains: string[]
  /** Never cleared, even if another rule matches. Wins over everything. */
  keepDomains: string[]
  /** Also strip matching entries from saved tab history. */
  clearHistory: boolean
}

export interface CleanupReport {
  hosts: string[]
  cookiesRemoved: number
  tabsRemoved: number
  historyRemoved: number
}

/** Dry run: what the current rules would drop vs keep, from saved history. */
export interface PrivacyPreview {
  forget: string[]
  keep: string[]
}

// --- panel sharing ----------------------------------------------------------

/** A device currently connected to a shared panel. */
export interface ShareClient {
  id: string
  /** Remote address as seen by the server (informational only). */
  address: string
  connectedAt: number
}

/** A guest waiting for the host to let them in. */
export interface PendingGuest {
  id: string
  address: string
  requestedAt: number
}

/** Public-internet exposure via a tunnel process. */
export type TunnelState = 'off' | 'starting' | 'on' | 'unavailable' | 'error'

/**
 * Where a guest can reach a share. A machine usually has several addresses and
 * most of them don't work from another device, so each is classified and ranked
 * rather than guessed at.
 */
export type ShareEndpointKind = 'lan' | 'vpn' | 'public' | 'local' | 'other'

export interface ShareEndpoint {
  url: string
  /** Adapter name, e.g. "Wi-Fi" or "Tailscale". */
  label: string
  kind: ShareEndpointKind
  /** One-line explanation of who can reach this address. */
  hint: string
}

/** Live state of one shared panel. */
export interface ShareInfo {
  panelId: string
  /** Unguessable token embedded in the share URL. */
  token: string
  /** Reachable addresses, best first. Unreachable ones are filtered out. */
  endpoints: ShareEndpoint[]
  /** Internet-reachable URL while a tunnel is running. */
  publicUrl: string | null
  tunnelState: TunnelState
  /** Reason shown when the tunnel is unavailable or failed. */
  tunnelMessage: string | null
  /** False = guest can watch but not click/type. */
  allowControl: boolean
  /** When true, guests must be admitted by the host before they see anything. */
  requireApproval: boolean
  clients: ShareClient[]
  pending: PendingGuest[]
  startedAt: number
}
