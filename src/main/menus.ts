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
    const withHandlers = template.map((item) =>
      item.type === 'separator'
        ? item
        : {
            ...item,
            click: () => {
              chosen = String(item.id)
            }
          }
    )
    Menu.buildFromTemplate(withHandlers).popup({
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

export function toolbarMenu(win: BrowserWindow, pinned: boolean): Promise<string | null> {
  return popupMenu(win, [
    { id: 'toggle-pin', label: 'Keep this bar visible', type: 'checkbox', checked: pinned },
    { type: 'separator' },
    { id: 'new-workspace', label: 'New workspace' },
    { id: 'settings', label: 'Settings…' }
  ])
}
