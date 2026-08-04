// Canonical IPC channel names + the shape of the API the preload bridge exposes
// on `window.workspace`. Keeping these in one shared module means main, preload
// and renderer can never drift out of sync.

import type { AppState, PanelBounds, ShareInfo, TabUpdate } from './types'
import type { CommandId } from './keymap'

export const IPC = {
  // renderer → main (invoke)
  panelEnsure: 'panel:ensure',
  panelDestroy: 'panel:destroy',
  panelSetBounds: 'panel:set-bounds',
  panelSetVisible: 'panel:set-visible',
  panelFocus: 'panel:focus',
  chromeFocus: 'chrome:focus',
  displayMove: 'display:move',
  displayInfo: 'display:info',
  tabCreate: 'tab:create',
  tabDestroy: 'tab:destroy',
  tabActivate: 'tab:activate',
  tabNavigate: 'tab:navigate',
  tabBack: 'tab:back',
  tabForward: 'tab:forward',
  tabReload: 'tab:reload',
  tabStop: 'tab:stop',
  tabDevtools: 'tab:devtools',
  appLoad: 'app:load',
  appSave: 'app:save',
  appExport: 'app:export',
  appImport: 'app:import',
  shareStart: 'share:start',
  shareStop: 'share:stop',
  shareSetControl: 'share:set-control',
  shareList: 'share:list',
  shareKick: 'share:kick',
  shareApprove: 'share:approve',
  shareDeny: 'share:deny',
  shareSetApproval: 'share:set-approval',
  shareTunnelStart: 'share:tunnel-start',
  shareTunnelStop: 'share:tunnel-stop',
  // main → renderer (send)
  tabUpdate: 'tab:update',
  shortcut: 'shortcut',
  panelFocused: 'panel:focused',
  shareUpdate: 'share:update'
} as const

/** The typed bridge surface available in the renderer as `window.workspace`. */
export interface WorkspaceApi {
  ensurePanel(panelId: string): Promise<void>
  destroyPanel(panelId: string): Promise<void>
  setPanelBounds(panelId: string, bounds: PanelBounds): Promise<void>
  setPanelVisible(panelId: string, visible: boolean): Promise<void>
  focusPanel(panelId: string): Promise<void>
  /** Move keyboard focus back to the chrome (e.g. when opening the palette). */
  focusChrome(): Promise<void>
  /** Move the app window to the next/previous display. Returns display count. */
  moveToDisplay(direction: 'next' | 'prev'): Promise<number>
  /** How many displays are currently attached. */
  displayCount(): Promise<number>
  createTab(panelId: string, tabId: string, url: string): Promise<void>
  destroyTab(panelId: string, tabId: string): Promise<void>
  activateTab(panelId: string, tabId: string): Promise<void>
  navigate(panelId: string, tabId: string, url: string): Promise<void>
  back(panelId: string, tabId: string): Promise<void>
  forward(panelId: string, tabId: string): Promise<void>
  reload(panelId: string, tabId: string): Promise<void>
  stop(panelId: string, tabId: string): Promise<void>
  toggleDevTools(panelId: string, tabId: string): Promise<void>
  loadApp(): Promise<AppState | null>
  saveApp(state: AppState): Promise<void>
  /** Export all workspaces to a user-chosen file. Resolves true if saved. */
  exportApp(state: AppState): Promise<boolean>
  /** Import workspaces from a user-chosen file (migrated if older format). */
  importApp(): Promise<AppState | null>
  onTabUpdate(cb: (update: TabUpdate) => void): () => void
  /** A shortcut fired inside a panel's web content (page had focus). */
  onShortcut(cb: (command: CommandId, panelId: string) => void): () => void
  /** A panel's web content gained focus (e.g. user clicked into a page). */
  onPanelFocused(cb: (panelId: string) => void): () => void

  // --- panel sharing ---
  /** Start sharing a panel; resolves with the live share (URLs + token). */
  startShare(panelId: string): Promise<ShareInfo | null>
  stopShare(panelId: string): Promise<void>
  setShareControl(panelId: string, allowControl: boolean): Promise<void>
  /** Disconnect one connected guest. */
  kickShareClient(panelId: string, clientId: string): Promise<void>
  /** Admit a guest waiting in the approval queue. */
  approveShareGuest(panelId: string, requestId: string): Promise<void>
  denyShareGuest(panelId: string, requestId: string): Promise<void>
  setShareApproval(panelId: string, requireApproval: boolean): Promise<void>
  /** Expose shares to the internet via a tunnel (opt-in). */
  startShareTunnel(): Promise<void>
  stopShareTunnel(): Promise<void>
  listShares(): Promise<ShareInfo[]>
  /** Fires whenever a share starts/stops or a guest connects/disconnects. */
  onShareUpdate(cb: (shares: ShareInfo[]) => void): () => void
}

declare global {
  interface Window {
    workspace: WorkspaceApi
  }
}
