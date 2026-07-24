import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'node:path'
import { WorkspaceManager } from './workspace/WorkspaceManager'
import { loadWindowState, trackWindowState } from './windowState'

// No native menu: our own keymap owns Ctrl+R / Ctrl+W etc. so they act on the
// active tab/panel instead of reloading or closing the chrome window.
Menu.setApplicationMenu(null)

function createWindow(): void {
  const saved = loadWindowState()
  const win = new BrowserWindow({
    ...(saved ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height } : { width: 1440, height: 900 }),
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#141519',
    title: 'Workspace Browser',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Own the panels for this window.
  new WorkspaceManager(win)
  trackWindowState(win)

  // Open normal target=_blank links from the chrome UI itself externally.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
