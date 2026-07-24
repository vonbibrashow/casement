// Canonical IPC channel names + the shape of the API the preload bridge exposes
// on `window.workspace`. Keeping these in one shared module means main, preload
// and renderer can never drift out of sync.

import type { AppState, PanelBounds, TabUpdate } from './types'

export const IPC = {
  // renderer → main (invoke)
  panelEnsure: 'panel:ensure',
  panelDestroy: 'panel:destroy',
  panelSetBounds: 'panel:set-bounds',
  panelSetVisible: 'panel:set-visible',
  panelFocus: 'panel:focus',
  tabCreate: 'tab:create',
  tabDestroy: 'tab:destroy',
  tabActivate: 'tab:activate',
  tabNavigate: 'tab:navigate',
  tabBack: 'tab:back',
  tabForward: 'tab:forward',
  tabReload: 'tab:reload',
  tabStop: 'tab:stop',
  appLoad: 'app:load',
  appSave: 'app:save',
  // main → renderer (send)
  tabUpdate: 'tab:update'
} as const

/** The typed bridge surface available in the renderer as `window.workspace`. */
export interface WorkspaceApi {
  ensurePanel(panelId: string): Promise<void>
  destroyPanel(panelId: string): Promise<void>
  setPanelBounds(panelId: string, bounds: PanelBounds): Promise<void>
  setPanelVisible(panelId: string, visible: boolean): Promise<void>
  focusPanel(panelId: string): Promise<void>
  createTab(panelId: string, tabId: string, url: string): Promise<void>
  destroyTab(panelId: string, tabId: string): Promise<void>
  activateTab(panelId: string, tabId: string): Promise<void>
  navigate(panelId: string, tabId: string, url: string): Promise<void>
  back(panelId: string, tabId: string): Promise<void>
  forward(panelId: string, tabId: string): Promise<void>
  reload(panelId: string, tabId: string): Promise<void>
  stop(panelId: string, tabId: string): Promise<void>
  loadApp(): Promise<AppState | null>
  saveApp(state: AppState): Promise<void>
  onTabUpdate(cb: (update: TabUpdate) => void): () => void
}

declare global {
  interface Window {
    workspace: WorkspaceApi
  }
}
