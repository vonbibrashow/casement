import { WebContentsView } from 'electron'
import type { PanelBounds, TabUpdate } from '@shared/types'
import { comboFromCode, resolveCommand, type CommandId } from '@shared/keymap'
import { recordVisit, updateTitle } from '../history'
import { hardenSession, isPageNavigationAllowed } from '../security/harden'
import { getSettings } from '../settings'

export interface TabCallbacks {
  update(u: TabUpdate): void
  /** A keyboard shortcut fired while this tab's page had focus. */
  shortcut(command: CommandId): void
  /** This tab's page gained focus. */
  focus(): void
}

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

  constructor(panelId: string, id: string, private cb: TabCallbacks) {
    this.panelId = panelId
    this.id = id
    hardenSession(`persist:panel-${panelId}`)
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
    this.cb.update({ panelId: this.panelId, tabId: this.id, ...patch })
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
    wc.on('did-navigate', () => {
      pushNav()
      void recordVisit(wc.getURL(), wc.getTitle())
    })
    wc.on('did-navigate-in-page', pushNav)
    wc.on('page-title-updated', (_e, title) => {
      this.emit({ title })
      // Titles usually arrive after the navigation, so backfill the entry.
      void updateTitle(wc.getURL(), title)
    })
    wc.on('focus', () => this.cb.focus())

    // Intercept app shortcuts before the page sees them, so they work while a
    // web page is focused.
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const mod = input.control || input.meta
      if (!mod && !input.alt) return
      const command = resolveCommand(comboFromCode(mod, input.alt, input.shift, input.code))
      if (command) {
        event.preventDefault()
        this.cb.shortcut(command)
      }
    })

    // Locked workspace: keep navigation docked inside this tab. Failures here
    // must be swallowed like any other navigation — a popup to a dead host
    // would otherwise reject unhandled in the main process.
    wc.setWindowOpenHandler(({ url }) => {
      // A page asking to open file://, javascript: or an external protocol is
      // trying to reach somewhere it has no business going.
      if (isPageNavigationAllowed(url)) this.load(url)
      return { action: 'deny' }
    })

    // Same guard for navigations the page drives itself, including iframes.
    // External protocol handlers can launch other applications, so a page must
    // never be able to trigger one unprompted.
    wc.on('will-navigate', (event, url) => {
      if (!isPageNavigationAllowed(url)) event.preventDefault()
    })
    wc.on('will-frame-navigate', (event) => {
      if (!isPageNavigationAllowed(event.url)) event.preventDefault()
    })

    // If an https upgrade cannot connect, fall back to the original http URL
    // rather than stranding the user on an error page.
    wc.on('did-fail-load', (_e, code, _desc, failedUrl, isMainFrame) => {
      const CONNECTION_ERRORS = [-100, -101, -105, -106, -107, -118, -200, -201, -202]
      if (!isMainFrame || !this.upgradedFrom || failedUrl !== this.upgradedUrl) return
      if (!CONNECTION_ERRORS.includes(code)) return
      const original = this.upgradedFrom
      this.upgradedFrom = null
      this.upgradedUrl = null
      void wc.loadURL(original).catch(() => {})
    })
  }

  /** Remembers an https upgrade so a connection failure can fall back. */
  private upgradedFrom: string | null = null
  private upgradedUrl: string | null = null

  load(url: string): void {
    void this.view.webContents.loadURL(this.applyHttpsUpgrade(url)).catch(() => {})
  }

  /**
   * Upgrade plain http:// to https://. Loopback and private-network addresses
   * are left alone — routers, NAS boxes and dev servers are commonly http-only,
   * and upgrading those just breaks them.
   */
  private applyHttpsUpgrade(url: string): string {
    this.upgradedFrom = null
    this.upgradedUrl = null
    if (!getSettings().httpsUpgrade || !url.startsWith('http://')) return url
    let host = ''
    try {
      host = new URL(url).hostname
    } catch {
      return url
    }
    const isLocal =
      host === 'localhost' ||
      host.endsWith('.local') ||
      /^127./.test(host) ||
      /^10./.test(host) ||
      /^192.168./.test(host) ||
      /^172.(1[6-9]|2d|3[01])./.test(host)
    if (isLocal) return url
    const upgraded = 'https://' + url.slice('http://'.length)
    this.upgradedFrom = url
    this.upgradedUrl = upgraded
    return upgraded
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

  toggleDevTools(): void {
    const wc = this.view.webContents
    if (wc.isDevToolsOpened()) wc.closeDevTools()
    else wc.openDevTools({ mode: 'detach' })
  }

  focus(): void {
    this.view.webContents.focus()
  }

  destroy(): void {
    this.view.webContents.close()
  }
}
