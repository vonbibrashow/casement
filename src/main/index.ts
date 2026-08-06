import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'node:path'
import { WorkspaceManager } from './workspace/WorkspaceManager'
import { loadWindowState, trackWindowState } from './windowState'
import { loadRules, runCleanup } from './privacy/cleaner'
import { migrateUserData } from './migrate'

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
    title: 'Casement',
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
  // Must run before any session or saved state is touched.
  const migratedFrom = migrateUserData()
  if (migratedFrom) console.log(`[casement] migrated profile from "${migratedFrom}"`)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Selective forget-on-exit. Quitting is deferred until the clear finishes,
// otherwise the process can die mid-write and leave data behind.
const CLEANUP_TIMEOUT_MS = 8000
let cleanupDone = false
app.on('before-quit', (event) => {
  if (cleanupDone) return
  event.preventDefault()
  const cleanup = loadRules().then((rules) => runCleanup(rules))
  // A watchdog so a stalled session call can never trap the app in "quitting".
  const watchdog = new Promise((resolve) => setTimeout(resolve, CLEANUP_TIMEOUT_MS))
  void Promise.race([cleanup, watchdog])
    .catch(() => undefined)
    .finally(() => {
      cleanupDone = true
      app.quit()
    })
})
