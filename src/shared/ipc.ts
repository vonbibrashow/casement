// Canonical IPC channel names + the shape of the API the preload bridge exposes
// on `window.workspace`. Keeping these in one shared module means main, preload
// and renderer can never drift out of sync.

import type { PanelBounds, PanelUpdate, WorkspaceState } from './types'

export const IPC = {
  // renderer → main (invoke)
  panelCreate: 'panel:create',
  panelDestroy: 'panel:destroy',
  panelSetBounds: 'panel:set-bounds',
  panelNavigate: 'panel:navigate',
  panelBack: 'panel:back',
  panelForward: 'panel:forward',
  panelReload: 'panel:reload',
  panelStop: 'panel:stop',
  panelFocus: 'panel:focus',
  panelSetVisible: 'panel:set-visible',
  workspaceLoad: 'workspace:load',
  workspaceSave: 'workspace:save',
  // main → renderer (send)
  panelUpdate: 'panel:update'
} as const

export interface CreatePanelArgs {
  id: string
  url: string
}

/** The typed bridge surface available in the renderer as `window.workspace`. */
export interface WorkspaceApi {
  createPanel(args: CreatePanelArgs): Promise<void>
  destroyPanel(id: string): Promise<void>
  setPanelBounds(id: string, bounds: PanelBounds): Promise<void>
  setPanelVisible(id: string, visible: boolean): Promise<void>
  navigate(id: string, url: string): Promise<void>
  back(id: string): Promise<void>
  forward(id: string): Promise<void>
  reload(id: string): Promise<void>
  stop(id: string): Promise<void>
  focusPanel(id: string): Promise<void>
  loadWorkspace(): Promise<WorkspaceState | null>
  saveWorkspace(state: WorkspaceState): Promise<void>
  onPanelUpdate(cb: (update: PanelUpdate) => void): () => void
}

declare global {
  interface Window {
    workspace: WorkspaceApi
  }
}
