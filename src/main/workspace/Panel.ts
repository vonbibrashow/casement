import { WebContentsView, session } from 'electron'
import type { PanelBounds, PanelUpdate } from '@shared/types'

/**
 * A single browser panel: a fully independent Chromium `WebContentsView` with
 * its own persistent session partition (cookies / cache / storage / history are
 * isolated per panel). The renderer positions it by pushing pixel bounds.
 */
export class Panel {
  readonly id: string
  readonly view: WebContentsView
  private bounds: PanelBounds = { x: 0, y: 0, width: 0, height: 0 }
  private visible = true

  constructor(id: string, private onUpdate: (u: PanelUpdate) => void) {
    this.id = id
    this.view = new WebContentsView({
      webPreferences: {
        // Per-panel partition → independent cookies, cache and session.
        partition: `persist:panel-${id}`,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    this.view.setBorderRadius(6)
    this.wireEvents()
  }

  private wireEvents(): void {
    const wc = this.view.webContents

    const pushNav = (): void => {
      this.onUpdate({
        id: this.id,
        url: wc.getURL(),
        title: wc.getTitle(),
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward()
      })
    }

    wc.on('did-start-loading', () => this.onUpdate({ id: this.id, isLoading: true }))
    wc.on('did-stop-loading', () => {
      this.onUpdate({ id: this.id, isLoading: false })
      pushNav()
    })
    wc.on('did-navigate', pushNav)
    wc.on('did-navigate-in-page', pushNav)
    wc.on('page-title-updated', (_e, title) => this.onUpdate({ id: this.id, title }))

    // Locked workspace: never spawn floating windows — keep navigation docked
    // inside the panel that triggered it.
    wc.setWindowOpenHandler(({ url }) => {
      void wc.loadURL(url)
      return { action: 'deny' }
    })
  }

  load(url: string): void {
    void this.view.webContents.loadURL(url).catch(() => {
      /* Bad URLs / offline — surfaced to the user by the page itself. */
    })
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
    // Collapse offscreen when hidden so it never intercepts input.
    this.view.setBounds(
      this.visible
        ? { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) }
        : { x: 0, y: 0, width: 0, height: 0 }
    )
  }

  back(): void {
    if (this.view.webContents.navigationHistory.canGoBack()) this.view.webContents.navigationHistory.goBack()
  }

  forward(): void {
    if (this.view.webContents.navigationHistory.canGoForward()) this.view.webContents.navigationHistory.goForward()
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
    // Clear the session cache so orphaned partitions don't grow unbounded.
    const part = `persist:panel-${this.id}`
    this.view.webContents.close()
    void session.fromPartition(part).clearCache().catch(() => {})
  }
}
