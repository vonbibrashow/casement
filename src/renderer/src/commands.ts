import { displayCombo, type CommandId } from '@shared/keymap'
import { useWorkspace } from './store/workspaceStore'
import { panelIds, type SplitEdge } from './layout/tree'
import { TEMPLATES } from './templates'

/** Ask the focused panel's URL bar to take focus (handled in PanelFrame). */
export function requestFocusUrl(panelId: string): void {
  window.dispatchEvent(new CustomEvent('mb:focus-url', { detail: panelId }))
}

/** The panel a command should act on: an explicit origin, else the focused one. */
function targetPanel(panelIdArg?: string): string {
  const s = useWorkspace.getState()
  if (panelIdArg && s.panels[panelIdArg]) return panelIdArg
  if (s.focusedPanelId && s.panels[s.focusedPanelId]) return s.focusedPanelId
  return panelIds(s.layout)[0]
}

/** Execute a keymap command. Used by both keyboard shortcuts and the palette. */
export function runCommand(id: CommandId, panelIdArg?: string): void {
  const s = useWorkspace.getState()
  const panelId = targetPanel(panelIdArg)
  const panel = s.panels[panelId]
  const activeTabId = panel?.activeTabId

  switch (id) {
    case 'palette.open':
      s.openPalette()
      break
    case 'tab.new':
      s.addTab(panelId)
      break
    case 'tab.close':
      if (activeTabId) s.closeTab(panelId, activeTabId)
      break
    case 'tab.next':
    case 'tab.prev': {
      if (!panel || panel.tabs.length < 2) break
      const idx = panel.tabs.findIndex((t) => t.id === activeTabId)
      const delta = id === 'tab.next' ? 1 : -1
      const next = panel.tabs[(idx + delta + panel.tabs.length) % panel.tabs.length]
      s.activateTab(panelId, next.id)
      break
    }
    case 'nav.reload':
      if (activeTabId) s.reload(panelId, activeTabId)
      break
    case 'nav.back':
      if (activeTabId) s.back(panelId, activeTabId)
      break
    case 'nav.forward':
      if (activeTabId) s.forward(panelId, activeTabId)
      break
    case 'nav.focusUrl':
      s.setFocusedPanel(panelId)
      requestFocusUrl(panelId)
      break
    case 'panel.splitRight':
      s.split(panelId, 'right')
      break
    case 'panel.splitDown':
      s.split(panelId, 'bottom')
      break
    case 'panel.close':
      s.closePanel(panelId)
      break
    case 'workspace.new':
      s.createWorkspace()
      break
    case 'layout.preset1':
      s.applyPreset(1)
      break
    case 'layout.preset2':
      s.applyPreset(2)
      break
    case 'layout.preset4':
      s.applyPreset(4)
      break
  }
}

export interface PaletteCommand {
  id: string
  title: string
  subtitle?: string
  keys?: string
  run(): void
}

/** The full command list shown in the palette (static + dynamic entries). */
export function useCommands(): PaletteCommand[] {
  const workspaces = useWorkspace((s) => s.workspaces)
  const activeId = useWorkspace((s) => s.activeWorkspaceId)

  const cmd = (id: CommandId, title: string, subtitle: string): PaletteCommand => ({
    id,
    title,
    subtitle,
    keys: displayCombo(id) || undefined,
    run: () => runCommand(id)
  })

  const splitCmd = (title: string, edge: SplitEdge): PaletteCommand => ({
    id: `panel.split.${edge}`,
    title,
    subtitle: 'Layout',
    run: () => useWorkspace.getState().split(targetPanel(), edge)
  })

  const list: PaletteCommand[] = [
    cmd('tab.new', 'New Tab', 'Tabs'),
    cmd('tab.close', 'Close Tab', 'Tabs'),
    cmd('tab.next', 'Next Tab', 'Tabs'),
    cmd('tab.prev', 'Previous Tab', 'Tabs'),
    cmd('nav.reload', 'Reload', 'Navigation'),
    cmd('nav.back', 'Back', 'Navigation'),
    cmd('nav.forward', 'Forward', 'Navigation'),
    cmd('nav.focusUrl', 'Focus Address Bar', 'Navigation'),
    cmd('panel.splitRight', 'Split Panel Right', 'Layout'),
    cmd('panel.splitDown', 'Split Panel Down', 'Layout'),
    splitCmd('Split Panel Left', 'left'),
    splitCmd('Split Panel Up', 'top'),
    cmd('panel.close', 'Close Panel', 'Layout'),
    cmd('layout.preset1', 'Layout: 1 Panel', 'Layout'),
    cmd('layout.preset2', 'Layout: 2 Panels', 'Layout'),
    cmd('layout.preset4', 'Layout: 4 Panels', 'Layout'),
    cmd('workspace.new', 'New Workspace', 'Workspace'),
    {
      id: 'perf.sleepBackground',
      title: 'Sleep Background Tabs',
      subtitle: 'Performance',
      run: () => useWorkspace.getState().sleepBackgroundTabs()
    }
  ]

  for (const t of TEMPLATES) {
    list.push({
      id: `workspace.template:${t.id}`,
      title: `New Workspace: ${t.name}`,
      subtitle: 'Template',
      run: () => useWorkspace.getState().createWorkspace(t)
    })
  }

  for (const ws of workspaces) {
    if (ws.id !== activeId) {
      list.push({
        id: `workspace.switch:${ws.id}`,
        title: `Switch to: ${ws.name}`,
        subtitle: 'Workspace',
        run: () => useWorkspace.getState().switchWorkspace(ws.id)
      })
    }
  }

  return list
}
