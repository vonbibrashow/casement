import { ipcMain, type BrowserWindow } from 'electron'
import { Panel } from './Panel'
import { loadWorkspace, saveWorkspace } from './persistence'
import { IPC, type CreatePanelArgs } from '@shared/ipc'
import type { PanelBounds, PanelUpdate, WorkspaceState } from '@shared/types'

/**
 * Owns every native browser panel for a window and brokers all IPC between the
 * React chrome and Chromium. The renderer is the source of truth for layout;
 * this manager just materialises panels as `WebContentsView`s and positions
 * them where the renderer says.
 */
export class WorkspaceManager {
  private panels = new Map<string, Panel>()

  constructor(private window: BrowserWindow) {
    this.registerIpc()
    window.on('closed', () => this.disposeAll())
  }

  private send(update: PanelUpdate): void {
    if (!this.window.isDestroyed()) this.window.webContents.send(IPC.panelUpdate, update)
  }

  private get(id: string): Panel | undefined {
    return this.panels.get(id)
  }

  private createPanel({ id, url }: CreatePanelArgs): void {
    if (this.panels.has(id)) return
    const panel = new Panel(id, (u) => this.send(u))
    this.window.contentView.addChildView(panel.view)
    this.panels.set(id, panel)
    panel.load(url)
  }

  private destroyPanel(id: string): void {
    const panel = this.panels.get(id)
    if (!panel) return
    this.window.contentView.removeChildView(panel.view)
    panel.destroy()
    this.panels.delete(id)
  }

  private disposeAll(): void {
    for (const id of [...this.panels.keys()]) this.destroyPanel(id)
  }

  private registerIpc(): void {
    ipcMain.handle(IPC.panelCreate, (_e, args: CreatePanelArgs) => this.createPanel(args))
    ipcMain.handle(IPC.panelDestroy, (_e, id: string) => this.destroyPanel(id))
    ipcMain.handle(IPC.panelSetBounds, (_e, id: string, bounds: PanelBounds) => this.get(id)?.setBounds(bounds))
    ipcMain.handle(IPC.panelSetVisible, (_e, id: string, visible: boolean) => this.get(id)?.setVisible(visible))
    ipcMain.handle(IPC.panelNavigate, (_e, id: string, url: string) => this.get(id)?.load(normalizeUrl(url)))
    ipcMain.handle(IPC.panelBack, (_e, id: string) => this.get(id)?.back())
    ipcMain.handle(IPC.panelForward, (_e, id: string) => this.get(id)?.forward())
    ipcMain.handle(IPC.panelReload, (_e, id: string) => this.get(id)?.reload())
    ipcMain.handle(IPC.panelStop, (_e, id: string) => this.get(id)?.stop())
    ipcMain.handle(IPC.panelFocus, (_e, id: string) => this.get(id)?.focus())
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
