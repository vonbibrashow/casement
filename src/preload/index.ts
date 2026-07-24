import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type WorkspaceApi } from '@shared/ipc'
import type { PanelBounds, TabUpdate, WorkspaceState } from '@shared/types'

const api: WorkspaceApi = {
  ensurePanel: (panelId) => ipcRenderer.invoke(IPC.panelEnsure, panelId),
  destroyPanel: (panelId) => ipcRenderer.invoke(IPC.panelDestroy, panelId),
  setPanelBounds: (panelId, bounds: PanelBounds) => ipcRenderer.invoke(IPC.panelSetBounds, panelId, bounds),
  setPanelVisible: (panelId, visible) => ipcRenderer.invoke(IPC.panelSetVisible, panelId, visible),
  focusPanel: (panelId) => ipcRenderer.invoke(IPC.panelFocus, panelId),
  createTab: (panelId, tabId, url) => ipcRenderer.invoke(IPC.tabCreate, panelId, tabId, url),
  destroyTab: (panelId, tabId) => ipcRenderer.invoke(IPC.tabDestroy, panelId, tabId),
  activateTab: (panelId, tabId) => ipcRenderer.invoke(IPC.tabActivate, panelId, tabId),
  navigate: (panelId, tabId, url) => ipcRenderer.invoke(IPC.tabNavigate, panelId, tabId, url),
  back: (panelId, tabId) => ipcRenderer.invoke(IPC.tabBack, panelId, tabId),
  forward: (panelId, tabId) => ipcRenderer.invoke(IPC.tabForward, panelId, tabId),
  reload: (panelId, tabId) => ipcRenderer.invoke(IPC.tabReload, panelId, tabId),
  stop: (panelId, tabId) => ipcRenderer.invoke(IPC.tabStop, panelId, tabId),
  loadWorkspace: () => ipcRenderer.invoke(IPC.workspaceLoad) as Promise<WorkspaceState | null>,
  saveWorkspace: (state: WorkspaceState) => ipcRenderer.invoke(IPC.workspaceSave, state),
  onTabUpdate: (cb: (update: TabUpdate) => void) => {
    const listener = (_e: unknown, update: TabUpdate): void => cb(update)
    ipcRenderer.on(IPC.tabUpdate, listener)
    return () => ipcRenderer.removeListener(IPC.tabUpdate, listener)
  }
}

contextBridge.exposeInMainWorld('workspace', api)
