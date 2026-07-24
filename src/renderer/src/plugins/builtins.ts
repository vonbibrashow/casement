import type { WorkspacePlugin } from './types'

// Built-in example plugins. They demonstrate every part of the PluginContext
// (commands, templates, panel access, devtools) and double as useful features.
// Third-party/external plugin loading can be layered on this same host later.
export const BUILTIN_PLUGINS: WorkspacePlugin[] = [
  {
    id: 'devtools',
    name: 'Developer Tools',
    description: 'Adds a command to open Chromium DevTools for the focused panel.',
    activate(ctx) {
      ctx.registerCommand({
        id: 'plugin.devtools.toggle',
        title: 'Toggle Panel DevTools',
        subtitle: 'Developer Tools',
        run: () => ctx.toggleDevTools()
      })
    }
  },
  {
    id: 'github-quicknav',
    name: 'GitHub Quick Nav',
    description: 'Commands to open GitHub pages in a new tab of the focused panel.',
    activate(ctx) {
      ctx.registerCommand({
        id: 'plugin.gh.home',
        title: 'GitHub: Open Home',
        subtitle: 'GitHub Quick Nav',
        run: () => ctx.openInNewTab('https://github.com')
      })
      ctx.registerCommand({
        id: 'plugin.gh.notifications',
        title: 'GitHub: Open Notifications',
        subtitle: 'GitHub Quick Nav',
        run: () => ctx.openInNewTab('https://github.com/notifications')
      })
    }
  },
  {
    id: 'social-template',
    name: 'Social Template',
    description: 'Adds a "Social" workspace template (X, Reddit, Hacker News).',
    activate(ctx) {
      ctx.registerTemplate({
        id: 'social',
        name: 'Social',
        icon: '💬',
        panels: [
          { urls: ['https://twitter.com'] },
          { urls: ['https://www.reddit.com'] },
          { urls: ['https://news.ycombinator.com'] }
        ]
      })
    }
  }
]

/** Plugins enabled on first run (before the user customizes in the modal). */
export const DEFAULT_ENABLED = ['devtools', 'github-quicknav']
