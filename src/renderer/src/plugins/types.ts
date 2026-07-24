import type { WorkspaceTemplate } from '../templates'

/** A command a plugin contributes to the command palette. */
export interface PluginCommand {
  id: string
  title: string
  subtitle?: string
  run(): void
}

export interface ActivePanel {
  panelId: string
  tabId: string
}

/**
 * The capability surface handed to a plugin on activation. This is the stable
 * contract the rest of the app can extend without plugins reaching into
 * internals — the modular seam the spec asks for.
 */
export interface PluginContext {
  /** Register a command; automatically removed when the plugin is disabled. */
  registerCommand(command: PluginCommand): void
  /** Register a workspace template; removed when the plugin is disabled. */
  registerTemplate(template: WorkspaceTemplate): void
  /** The currently focused panel + its active tab, if any. */
  getActivePanel(): ActivePanel | null
  /** Open a URL in a new tab of the focused panel. */
  openInNewTab(url: string): void
  /** Toggle Chromium DevTools for the focused panel's active tab. */
  toggleDevTools(): void
}

export interface WorkspacePlugin {
  id: string
  name: string
  description: string
  /** Called when the plugin is enabled. Register contributions via `ctx`. */
  activate(ctx: PluginContext): void
}
