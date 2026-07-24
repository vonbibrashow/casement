import { WebContentsView } from 'electron'
import type { PanelBounds, TabUpdate } from '@shared/types'

/**
 * A single tab: a real Chromium `WebContentsView`. All tabs in a panel share the
 * panel's session partition, so they behave like tabs in one browser window
 * while staying isolated from other panels.
 */
export class Tab {
  readonly id: string
  readonly panelId: string
  readonly view: WebContentsView
  private bounds: PanelBounds = { x: 0, y: 0, width: 0, height: 0 }
  private visible = false

  constructor(panelId: string, id: string, private onUpdate: (u: TabUpdate) => void) {
    this.panelId = panelId
    this.id = id
    this.view = new WebContentsView({
      webPreferences: {
        partition: `persist:panel-${panelId}`,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    this.view.setVisible(false)
    this.wireEvents()
  }

  private emit(patch: Omit<TabUpdate, 'panelId' | 'tabId'>): void {
    this.onUpdate({ panelId: this.panelId, tabId: this.id, ...patch })
  }

  private wireEvents(): void {
    const wc = this.view.webContents
    const pushNav = (): void =>
      this.emit({
        url: wc.getURL(),
        title: wc.getTitle(),
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward()
      })

    wc.on('did-start-loading', () => this.emit({ isLoading: true }))
    wc.on('did-stop-loading', () => {
      this.emit({ isLoading: false })
      pushNav()
    })
    wc.on('did-navigate', pushNav)
    wc.on('did-navigate-in-page', pushNav)
    wc.on('page-title-updated', (_e, title) => this.emit({ title }))

    // Locked workspace: keep navigation docked inside this tab.
    wc.setWindowOpenHandler(({ url }) => {
      void wc.loadURL(url)
      return { action: 'deny' }
    })
  }

  load(url: string): void {
    void this.view.webContents.loadURL(url).catch(() => {})
  }

  setBounds(bounds: PanelBounds): void {
    this.bounds = bounds
    this.applyBounds()
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.view.setVisible(visible)
    this.applyBounds()
  }

  private applyBounds(): void {
    const b = this.bounds
    this.view.setBounds(
      this.visible
        ? { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) }
        : { x: 0, y: 0, width: 0, height: 0 }
    )
  }

  back(): void {
    const h = this.view.webContents.navigationHistory
    if (h.canGoBack()) h.goBack()
  }

  forward(): void {
    const h = this.view.webContents.navigationHistory
    if (h.canGoForward()) h.goForward()
  }

  reload(): void {
    this.view.webContents.reload()
  }

  stop(): void {
    this.view.webContents.stop()
  }

  focus(): void {
    this.view.webContents.focus()
  }

  destroy(): void {
    this.view.webContents.close()
  }
}
