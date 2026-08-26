import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'

// Context menus for the chrome bars.
//
// These are native menus rather than DOM ones on purpose: a panel's
// WebContentsView paints above the renderer, so a DOM menu opened over the
// page would be invisible unless every panel were hidden first. The OS menu
// floats above everything and needs none of that.

/** Resolves with the chosen action id, or null if the menu was dismissed. */
function popupMenu(win: BrowserWindow, template: MenuItemConstructorOptions[]): Promise<string | null> {
  return new Promise((resolve) => {
    let chosen: string | null = null
    // Recurses, or items nested in a submenu would have no click handler.
    const attach = (items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] =>
      items.map((item) => {
        if (item.type === 'separator') return item
        if (Array.isArray(item.submenu)) {
          return { ...item, submenu: attach(item.submenu as MenuItemConstructorOptions[]) }
        }
        return {
          ...item,
          click: () => {
            chosen = String(item.id)
          }
        }
      })
    Menu.buildFromTemplate(attach(template)).popup({
      window: win,
      // Fires after any click handler, so `chosen` is settled by now.
      callback: () => resolve(chosen)
    })
  })
}

export function panelChromeMenu(win: BrowserWindow, pinned: boolean, canClose: boolean): Promise<string | null> {
  return popupMenu(win, [
    { id: 'toggle-pin', label: 'Keep this bar visible', type: 'checkbox', checked: pinned },
    { type: 'separator' },
    { id: 'new-tab', label: 'New tab' },
    { id: 'split-right', label: 'Split right' },
    { id: 'split-down', label: 'Split down' },
    { type: 'separator' },
    { id: 'close-panel', label: 'Close panel', enabled: canClose }
  ])
}

export function railMenu(win: BrowserWindow, pinned: boolean): Promise<string | null> {
  return popupMenu(win, [
    { id: 'toggle-pin', label: 'Keep this bar visible', type: 'checkbox', checked: pinned },
    { type: 'separator' },
    { id: 'new-workspace', label: 'New workspace' },
    { type: 'separator' },
    { id: 'move-to-toolbar', label: 'Move switcher to the top bar' },
    { id: 'settings', label: 'Settings…' }
  ])
}

/**
 * Workspace switcher for the top bar. Built from live data, so it lists the
 * actual workspaces and templates rather than a fixed set.
 */
export function workspaceMenu(
  win: BrowserWindow,
  workspaces: Array<{ id: string; name: string; icon: string }>,
  activeId: string,
  templates: Array<{ id: string; name: string }>
): Promise<string | null> {
  const items: MenuItemConstructorOptions[] = workspaces.map((w) => ({
    id: `switch:${w.id}`,
    label: `${w.icon}  ${w.name}`,
    type: 'checkbox',
    checked: w.id === activeId
  }))
  items.push({ type: 'separator' }, { id: 'new-workspace', label: 'New workspace' })
  if (templates.length > 0) {
    items.push({
      id: 'templates',
      label: 'New from template',
      submenu: templates.map((t) => ({ id: `template:${t.id}`, label: t.name }))
    })
  }
  items.push({ type: 'separator' }, { id: 'move-to-rail', label: 'Move switcher to the side rail' })
  return popupMenu(win, items)
}

export function toolbarMenu(win: BrowserWindow, pinned: boolean): Promise<string | null> {
  return popupMenu(win, [
    { id: 'toggle-pin', label: 'Keep this bar visible', type: 'checkbox', checked: pinned },
    { type: 'separator' },
    { id: 'new-workspace', label: 'New workspace' },
    { id: 'settings', label: 'Settings…' }
  ])
}
