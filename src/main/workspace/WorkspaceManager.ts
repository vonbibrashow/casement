import { ipcMain, type BrowserWindow } from 'electron'
import { Panel } from './Panel'
import { loadWorkspace, saveWorkspace } from './persistence'
import { IPC } from '@shared/ipc'
import type { PanelBounds, TabUpdate, WorkspaceState } from '@shared/types'

/**
 * Owns every native panel/tab for a window and brokers all IPC between the React
 * chrome and Chromium. The renderer is the source of truth for layout + tabs;
 * this manager materialises them as `WebContentsView`s and positions them.
 */
export class WorkspaceManager {
  private panels = new Map<string, Panel>()

  constructor(private window: BrowserWindow) {
    this.registerIpc()
    window.on('closed', () => this.disposeAll())
  }

  private send(update: TabUpdate): void {
    if (!this.window.isDestroyed()) this.window.webContents.send(IPC.tabUpdate, update)
  }

  private get(panelId: string): Panel | undefined {
    return this.panels.get(panelId)
  }

  private ensurePanel(panelId: string): Panel {
    let panel = this.panels.get(panelId)
    if (!panel) {
      panel = new Panel(panelId, this.window, (u) => this.send(u))
      this.panels.set(panelId, panel)
    }
    return panel
  }

  private destroyPanel(panelId: string): void {
    const panel = this.panels.get(panelId)
    if (!panel) return
    panel.destroy()
    this.panels.delete(panelId)
  }

  private disposeAll(): void {
    for (const id of [...this.panels.keys()]) this.destroyPanel(id)
  }

  private registerIpc(): void {
    ipcMain.handle(IPC.panelEnsure, (_e, panelId: string) => void this.ensurePanel(panelId))
    ipcMain.handle(IPC.panelDestroy, (_e, panelId: string) => this.destroyPanel(panelId))
    ipcMain.handle(IPC.panelSetBounds, (_e, panelId: string, bounds: PanelBounds) => this.get(panelId)?.setBounds(bounds))
    ipcMain.handle(IPC.panelSetVisible, (_e, panelId: string, visible: boolean) => this.get(panelId)?.setVisible(visible))
    ipcMain.handle(IPC.panelFocus, (_e, panelId: string) => this.get(panelId)?.focus())

    ipcMain.handle(IPC.tabCreate, (_e, panelId: string, tabId: string, url: string) =>
      this.ensurePanel(panelId).createTab(tabId, normalizeUrl(url))
    )
    ipcMain.handle(IPC.tabDestroy, (_e, panelId: string, tabId: string) => this.get(panelId)?.destroyTab(tabId))
    ipcMain.handle(IPC.tabActivate, (_e, panelId: string, tabId: string) => this.get(panelId)?.activateTab(tabId))
    ipcMain.handle(IPC.tabNavigate, (_e, panelId: string, tabId: string, url: string) =>
      this.get(panelId)?.navigate(tabId, normalizeUrl(url))
    )
    ipcMain.handle(IPC.tabBack, (_e, panelId: string, tabId: string) => this.get(panelId)?.back(tabId))
    ipcMain.handle(IPC.tabForward, (_e, panelId: string, tabId: string) => this.get(panelId)?.forward(tabId))
    ipcMain.handle(IPC.tabReload, (_e, panelId: string, tabId: string) => this.get(panelId)?.reload(tabId))
    ipcMain.handle(IPC.tabStop, (_e, panelId: string, tabId: string) => this.get(panelId)?.stop(tabId))

    ipcMain.handle(IPC.workspaceLoad, () => loadWorkspace())
    ipcMain.handle(IPC.workspaceSave, (_e, state: WorkspaceState) => saveWorkspace(state))
  }
}

/**
 * Turn whatever the user typed in a URL bar into a loadable URL: full URLs pass
 * through, bare domains get https://, everything else becomes a Google search.
 */
export function normalizeUrl(input: string): string {
  const value = input.trim()
  if (!value) return 'about:blank'
  if (/^[a-z]+:\/\//i.test(value) || value.startsWith('about:')) return value
  const looksLikeDomain = /^[^\s]+\.[^\s]{2,}(\/.*)?$/.test(value) && !value.includes(' ')
  if (looksLikeDomain) return `https://${value}`
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`
}
