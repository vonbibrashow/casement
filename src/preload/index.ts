import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type WorkspaceApi } from '@shared/ipc'
import type { AppState, PanelBounds, ShareInfo, TabUpdate } from '@shared/types'
import type { CommandId } from '@shared/keymap'

const api: WorkspaceApi = {
  ensurePanel: (panelId) => ipcRenderer.invoke(IPC.panelEnsure, panelId),
  destroyPanel: (panelId) => ipcRenderer.invoke(IPC.panelDestroy, panelId),
  setPanelBounds: (panelId, bounds: PanelBounds) => ipcRenderer.invoke(IPC.panelSetBounds, panelId, bounds),
  setPanelVisible: (panelId, visible) => ipcRenderer.invoke(IPC.panelSetVisible, panelId, visible),
  focusPanel: (panelId) => ipcRenderer.invoke(IPC.panelFocus, panelId),
  focusChrome: () => ipcRenderer.invoke(IPC.chromeFocus),
  moveToDisplay: (direction) => ipcRenderer.invoke(IPC.displayMove, direction) as Promise<number>,
  displayCount: () => ipcRenderer.invoke(IPC.displayInfo) as Promise<number>,
  createTab: (panelId, tabId, url) => ipcRenderer.invoke(IPC.tabCreate, panelId, tabId, url),
  destroyTab: (panelId, tabId) => ipcRenderer.invoke(IPC.tabDestroy, panelId, tabId),
  activateTab: (panelId, tabId) => ipcRenderer.invoke(IPC.tabActivate, panelId, tabId),
  navigate: (panelId, tabId, url) => ipcRenderer.invoke(IPC.tabNavigate, panelId, tabId, url),
  back: (panelId, tabId) => ipcRenderer.invoke(IPC.tabBack, panelId, tabId),
  forward: (panelId, tabId) => ipcRenderer.invoke(IPC.tabForward, panelId, tabId),
  reload: (panelId, tabId) => ipcRenderer.invoke(IPC.tabReload, panelId, tabId),
  stop: (panelId, tabId) => ipcRenderer.invoke(IPC.tabStop, panelId, tabId),
  toggleDevTools: (panelId, tabId) => ipcRenderer.invoke(IPC.tabDevtools, panelId, tabId),
  loadApp: () => ipcRenderer.invoke(IPC.appLoad) as Promise<AppState | null>,
  saveApp: (state: AppState) => ipcRenderer.invoke(IPC.appSave, state),
  exportApp: (state: AppState) => ipcRenderer.invoke(IPC.appExport, state) as Promise<boolean>,
  importApp: () => ipcRenderer.invoke(IPC.appImport) as Promise<AppState | null>,
  onTabUpdate: (cb: (update: TabUpdate) => void) => {
    const listener = (_e: unknown, update: TabUpdate): void => cb(update)
    ipcRenderer.on(IPC.tabUpdate, listener)
    return () => ipcRenderer.removeListener(IPC.tabUpdate, listener)
  },
  onShortcut: (cb: (command: CommandId, panelId: string) => void) => {
    const listener = (_e: unknown, command: CommandId, panelId: string): void => cb(command, panelId)
    ipcRenderer.on(IPC.shortcut, listener)
    return () => ipcRenderer.removeListener(IPC.shortcut, listener)
  },
  onPanelFocused: (cb: (panelId: string) => void) => {
    const listener = (_e: unknown, panelId: string): void => cb(panelId)
    ipcRenderer.on(IPC.panelFocused, listener)
    return () => ipcRenderer.removeListener(IPC.panelFocused, listener)
  },

  startShare: (panelId) => ipcRenderer.invoke(IPC.shareStart, panelId) as Promise<ShareInfo | null>,
  stopShare: (panelId) => ipcRenderer.invoke(IPC.shareStop, panelId),
  setShareControl: (panelId, allowControl) => ipcRenderer.invoke(IPC.shareSetControl, panelId, allowControl),
  kickShareClient: (panelId, clientId) => ipcRenderer.invoke(IPC.shareKick, panelId, clientId),
  approveShareGuest: (panelId, requestId) => ipcRenderer.invoke(IPC.shareApprove, panelId, requestId),
  denyShareGuest: (panelId, requestId) => ipcRenderer.invoke(IPC.shareDeny, panelId, requestId),
  setShareApproval: (panelId, requireApproval) => ipcRenderer.invoke(IPC.shareSetApproval, panelId, requireApproval),
  startShareTunnel: () => ipcRenderer.invoke(IPC.shareTunnelStart),
  stopShareTunnel: () => ipcRenderer.invoke(IPC.shareTunnelStop),
  listShares: () => ipcRenderer.invoke(IPC.shareList) as Promise<ShareInfo[]>,
  onShareUpdate: (cb: (shares: ShareInfo[]) => void) => {
    const listener = (_e: unknown, shares: ShareInfo[]): void => cb(shares)
    ipcRenderer.on(IPC.shareUpdate, listener)
    return () => ipcRenderer.removeListener(IPC.shareUpdate, listener)
  }
}

contextBridge.exposeInMainWorld('workspace', api)
