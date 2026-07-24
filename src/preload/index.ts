import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type CreatePanelArgs, type WorkspaceApi } from '@shared/ipc'
import type { PanelBounds, PanelUpdate, WorkspaceState } from '@shared/types'

const api: WorkspaceApi = {
  createPanel: (args: CreatePanelArgs) => ipcRenderer.invoke(IPC.panelCreate, args),
  destroyPanel: (id) => ipcRenderer.invoke(IPC.panelDestroy, id),
  setPanelBounds: (id, bounds: PanelBounds) => ipcRenderer.invoke(IPC.panelSetBounds, id, bounds),
  setPanelVisible: (id, visible) => ipcRenderer.invoke(IPC.panelSetVisible, id, visible),
  navigate: (id, url) => ipcRenderer.invoke(IPC.panelNavigate, id, url),
  back: (id) => ipcRenderer.invoke(IPC.panelBack, id),
  forward: (id) => ipcRenderer.invoke(IPC.panelForward, id),
  reload: (id) => ipcRenderer.invoke(IPC.panelReload, id),
  stop: (id) => ipcRenderer.invoke(IPC.panelStop, id),
  focusPanel: (id) => ipcRenderer.invoke(IPC.panelFocus, id),
  loadWorkspace: () => ipcRenderer.invoke(IPC.workspaceLoad) as Promise<WorkspaceState | null>,
  saveWorkspace: (state: WorkspaceState) => ipcRenderer.invoke(IPC.workspaceSave, state),
  onPanelUpdate: (cb: (update: PanelUpdate) => void) => {
    const listener = (_e: unknown, update: PanelUpdate): void => cb(update)
    ipcRenderer.on(IPC.panelUpdate, listener)
    return () => ipcRenderer.removeListener(IPC.panelUpdate, listener)
  }
}

contextBridge.exposeInMainWorld('workspace', api)
