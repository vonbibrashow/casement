import { ipcMain, screen, type BrowserWindow } from 'electron'
import { Panel } from './Panel'
import { loadApp, saveApp } from './persistence'
import { moveWindowToDisplay } from '../windowState'
import { exportApp, importApp } from './sync'
import { ShareServer } from '../share/ShareServer'
import { IPC } from '@shared/ipc'
import type { AppState, PanelBounds, TabUpdate } from '@shared/types'
import type { CommandId } from '@shared/keymap'

/**
 * Owns every native panel/tab for a window and brokers all IPC between the React
 * chrome and Chromium. The renderer is the source of truth for layout + tabs;
 * this manager materialises them as `WebContentsView`s and positions them.
 */
export class WorkspaceManager {
  private panels = new Map<string, Panel>()
  private shares = new ShareServer((panelId) => this.panels.get(panelId)?.activeWebContents() ?? null)

  constructor(private window: BrowserWindow) {
    this.registerIpc()
    this.shares.onChange(() => this.emit(IPC.shareUpdate, this.shares.list()))
    window.on('closed', () => this.disposeAll())
  }

  private emit(channel: string, ...args: unknown[]): void {
    if (!this.window.isDestroyed()) this.window.webContents.send(channel, ...args)
  }

  private get(panelId: string): Panel | undefined {
    return this.panels.get(panelId)
  }

  private ensurePanel(panelId: string): Panel {
    let panel = this.panels.get(panelId)
    if (!panel) {
      panel = new Panel(panelId, this.window, {
        update: (u: TabUpdate) => {
          this.emit(IPC.tabUpdate, u)
          // Keep guests' title/URL in sync with the shared page.
          if ((u.url || u.title) && this.shares.isShared(u.panelId)) this.shares.notifyNavigation(u.panelId)
        },
        shortcut: (command: CommandId, id: string) => this.emit(IPC.shortcut, command, id),
        focus: (id: string) => this.emit(IPC.panelFocused, id)
      })
      this.panels.set(panelId, panel)
    }
    return panel
  }

  private destroyPanel(panelId: string): void {
    const panel = this.panels.get(panelId)
    if (!panel) return
    // A panel that no longer exists must never stay shared.
    this.shares.stop(panelId)
    panel.destroy()
    this.panels.delete(panelId)
  }

  private disposeAll(): void {
    this.shares.disposeAll()
    for (const id of [...this.panels.keys()]) this.destroyPanel(id)
  }

  private registerIpc(): void {
    ipcMain.handle(IPC.panelEnsure, (_e, panelId: string) => void this.ensurePanel(panelId))
    ipcMain.handle(IPC.panelDestroy, (_e, panelId: string) => this.destroyPanel(panelId))
    ipcMain.handle(IPC.panelSetBounds, (_e, panelId: string, bounds: PanelBounds) => this.get(panelId)?.setBounds(bounds))
    ipcMain.handle(IPC.panelSetVisible, (_e, panelId: string, visible: boolean) => this.get(panelId)?.setVisible(visible))
    ipcMain.handle(IPC.panelFocus, (_e, panelId: string) => this.get(panelId)?.focus())
    ipcMain.handle(IPC.chromeFocus, () => {
      if (!this.window.isDestroyed()) this.window.webContents.focus()
    })
    ipcMain.handle(IPC.displayMove, (_e, direction: 'next' | 'prev') => moveWindowToDisplay(this.window, direction))
    ipcMain.handle(IPC.displayInfo, () => screen.getAllDisplays().length)

    ipcMain.handle(IPC.tabCreate, (_e, panelId: string, tabId: string, url: string) =>
      this.ensurePanel(panelId).createTab(tabId, normalizeUrl(url))
    )
    ipcMain.handle(IPC.tabDestroy, (_e, panelId: string, tabId: string) => this.get(panelId)?.destroyTab(tabId))
    ipcMain.handle(IPC.tabActivate, (_e, panelId: string, tabId: string) => {
      this.get(panelId)?.activateTab(tabId)
      // A live share follows the panel's active tab.
      this.shares.retarget(panelId)
    })
    ipcMain.handle(IPC.tabNavigate, (_e, panelId: string, tabId: string, url: string) =>
      this.get(panelId)?.navigate(tabId, normalizeUrl(url))
    )
    ipcMain.handle(IPC.tabBack, (_e, panelId: string, tabId: string) => this.get(panelId)?.back(tabId))
    ipcMain.handle(IPC.tabForward, (_e, panelId: string, tabId: string) => this.get(panelId)?.forward(tabId))
    ipcMain.handle(IPC.tabReload, (_e, panelId: string, tabId: string) => this.get(panelId)?.reload(tabId))
    ipcMain.handle(IPC.tabStop, (_e, panelId: string, tabId: string) => this.get(panelId)?.stop(tabId))
    ipcMain.handle(IPC.tabDevtools, (_e, panelId: string, tabId: string) => this.get(panelId)?.toggleDevTools(tabId))

    ipcMain.handle(IPC.appLoad, () => loadApp())
    ipcMain.handle(IPC.appSave, (_e, state: AppState) => saveApp(state))
    ipcMain.handle(IPC.appExport, (_e, state: AppState) => exportApp(this.window, state))
    ipcMain.handle(IPC.appImport, () => importApp(this.window))

    ipcMain.handle(IPC.shareStart, (_e, panelId: string) => this.shares.start(panelId))
    ipcMain.handle(IPC.shareStop, (_e, panelId: string) => this.shares.stop(panelId))
    ipcMain.handle(IPC.shareSetControl, (_e, panelId: string, allow: boolean) => this.shares.setControl(panelId, allow))
    ipcMain.handle(IPC.shareKick, (_e, panelId: string, clientId: string) => this.shares.kick(panelId, clientId))
    ipcMain.handle(IPC.shareList, () => this.shares.list())
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
