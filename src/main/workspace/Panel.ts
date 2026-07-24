import { session, type BrowserWindow } from 'electron'
import { Tab } from './Tab'
import type { PanelBounds, TabUpdate } from '@shared/types'

/**
 * A panel: a container of tabs. Only the active tab's `WebContentsView` is
 * visible and positioned; the rest are kept alive but hidden for instant
 * switching. The panel owns attaching/detaching its tabs' views to the window.
 */
export class Panel {
  readonly id: string
  private tabs = new Map<string, Tab>()
  private activeTabId: string | null = null
  private bounds: PanelBounds = { x: 0, y: 0, width: 0, height: 0 }
  private visible = true

  constructor(id: string, private window: BrowserWindow, private onUpdate: (u: TabUpdate) => void) {
    this.id = id
  }

  hasTab(tabId: string): boolean {
    return this.tabs.has(tabId)
  }

  createTab(tabId: string, url: string): void {
    if (this.tabs.has(tabId)) return
    const tab = new Tab(this.id, tabId, this.onUpdate)
    this.window.contentView.addChildView(tab.view)
    tab.setBounds(this.bounds)
    this.tabs.set(tabId, tab)
    tab.load(url)
    if (!this.activeTabId) this.activateTab(tabId)
  }

  destroyTab(tabId: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    this.window.contentView.removeChildView(tab.view)
    tab.destroy()
    this.tabs.delete(tabId)
    if (this.activeTabId === tabId) {
      this.activeTabId = null
      const next = this.tabs.keys().next().value
      if (next) this.activateTab(next)
    }
  }

  activateTab(tabId: string): void {
    if (!this.tabs.has(tabId) || this.activeTabId === tabId) {
      if (this.tabs.has(tabId)) this.activeTabId = tabId
      return
    }
    const prev = this.activeTabId ? this.tabs.get(this.activeTabId) : undefined
    prev?.setVisible(false)
    this.activeTabId = tabId
    const tab = this.tabs.get(tabId)!
    tab.setVisible(this.visible)
    tab.setBounds(this.bounds)
  }

  private active(): Tab | undefined {
    return this.activeTabId ? this.tabs.get(this.activeTabId) : undefined
  }

  setBounds(bounds: PanelBounds): void {
    this.bounds = bounds
    this.active()?.setBounds(bounds)
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.active()?.setVisible(visible)
  }

  navigate(tabId: string, url: string): void {
    this.tabs.get(tabId)?.load(url)
  }

  back(tabId: string): void {
    this.tabs.get(tabId)?.back()
  }

  forward(tabId: string): void {
    this.tabs.get(tabId)?.forward()
  }

  reload(tabId: string): void {
    this.tabs.get(tabId)?.reload()
  }

  stop(tabId: string): void {
    this.tabs.get(tabId)?.stop()
  }

  focus(): void {
    this.active()?.focus()
  }

  destroy(): void {
    for (const tab of this.tabs.values()) {
      this.window.contentView.removeChildView(tab.view)
      tab.destroy()
    }
    this.tabs.clear()
    this.activeTabId = null
    // Independent per-panel session — clear its cache when the panel is gone.
    void session.fromPartition(`persist:panel-${this.id}`).clearCache().catch(() => {})
  }
}
