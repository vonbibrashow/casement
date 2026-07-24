import type { WorkspaceTemplate } from '../templates'
import { useWorkspace } from '../store/workspaceStore'
import { BUILTIN_PLUGINS, DEFAULT_ENABLED } from './builtins'
import type { ActivePanel, PluginCommand, PluginContext, WorkspacePlugin } from './types'

const STORAGE_KEY = 'mb:plugins:enabled'

/**
 * Loads plugins and collects their contributions (commands + templates). Plugins
 * are internal modules for now; this host is the seam a future external loader
 * would plug into. Enabling/disabling rebuilds all contributions from scratch,
 * so `activate` must only register — no side effects to undo.
 */
class PluginHost {
  private plugins: WorkspacePlugin[] = BUILTIN_PLUGINS
  private enabled = new Set<string>()
  private commands: PluginCommand[] = []
  private templates: WorkspaceTemplate[] = []
  private listeners = new Set<() => void>()

  init(): void {
    this.enabled = new Set(this.loadEnabled())
    this.rebuild()
  }

  private loadEnabled(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw) as string[]
    } catch {
      /* fall through to defaults */
    }
    return DEFAULT_ENABLED
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.enabled]))
    } catch {
      /* best effort */
    }
  }

  private activePanel(): ActivePanel | null {
    const s = useWorkspace.getState()
    const pid = s.focusedPanelId && s.panels[s.focusedPanelId] ? s.focusedPanelId : Object.keys(s.panels)[0]
    const panel = pid ? s.panels[pid] : undefined
    return panel ? { panelId: panel.id, tabId: panel.activeTabId } : null
  }

  private context(): PluginContext {
    return {
      registerCommand: (command) => this.commands.push(command),
      registerTemplate: (template) => this.templates.push(template),
      getActivePanel: () => this.activePanel(),
      openInNewTab: (url) => {
        const ap = this.activePanel()
        if (ap) useWorkspace.getState().addTab(ap.panelId, url)
      },
      toggleDevTools: () => {
        const ap = this.activePanel()
        if (ap) useWorkspace.getState().toggleDevTools(ap.panelId, ap.tabId)
      }
    }
  }

  private rebuild(): void {
    this.commands = []
    this.templates = []
    const ctx = this.context()
    for (const plugin of this.plugins) {
      if (this.enabled.has(plugin.id)) plugin.activate(ctx)
    }
    this.listeners.forEach((l) => l())
  }

  setEnabled(id: string, on: boolean): void {
    if (on) this.enabled.add(id)
    else this.enabled.delete(id)
    this.persist()
    this.rebuild()
  }

  isEnabled(id: string): boolean {
    return this.enabled.has(id)
  }

  list(): Array<{ id: string; name: string; description: string; enabled: boolean }> {
    return this.plugins.map((p) => ({ id: p.id, name: p.name, description: p.description, enabled: this.enabled.has(p.id) }))
  }

  getCommands(): PluginCommand[] {
    return this.commands
  }

  getTemplates(): WorkspaceTemplate[] {
    return this.templates
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const pluginHost = new PluginHost()
