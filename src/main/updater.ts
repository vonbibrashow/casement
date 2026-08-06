import { app, type BrowserWindow } from 'electron'
import pkg from 'electron-updater'
import type { UpdateStatus } from '@shared/types'
import { IPC } from '@shared/ipc'

// Shipping a browser means shipping Chromium, which gets security fixes
// constantly. Without an update path every user is stranded on whatever build
// they installed, so this is a safety feature rather than a convenience one.
//
// Updates are served from GitHub Releases, which costs nothing for a public
// repo. Until `publish` is configured in electron-builder.yml the checks
// no-op cleanly instead of erroring at the user.

const { autoUpdater } = pkg

let win: BrowserWindow | null = null
let status: UpdateStatus = { state: 'idle', version: null, message: null, percent: 0 }

function push(next: Partial<UpdateStatus>): void {
  status = { ...status, ...next }
  if (win && !win.isDestroyed()) win.webContents.send(IPC.updateStatus, status)
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

export function initUpdater(window: BrowserWindow): void {
  win = window
  // The user decides when to install; downloading silently is fine, restarting
  // out from under them is not.
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => push({ state: 'checking', message: null }))
  autoUpdater.on('update-available', (info) => push({ state: 'downloading', version: info.version, percent: 0 }))
  autoUpdater.on('update-not-available', () => push({ state: 'current', version: app.getVersion(), percent: 0 }))
  autoUpdater.on('download-progress', (p) => push({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => push({ state: 'ready', version: info.version, percent: 100 }))
  autoUpdater.on('error', (err) =>
    push({ state: 'error', message: err?.message ?? 'Update check failed' })
  )
}

/** Returns false when updates aren't available in this build (dev, or unpublished). */
export async function checkForUpdates(): Promise<boolean> {
  if (!app.isPackaged) {
    push({ state: 'unsupported', message: 'Updates only run in an installed build.' })
    return false
  }
  try {
    await autoUpdater.checkForUpdates()
    return true
  } catch (err) {
    push({ state: 'error', message: err instanceof Error ? err.message : 'Update check failed' })
    return false
  }
}

/** Restart into the downloaded update. Only valid once state is 'ready'. */
export function installUpdate(): void {
  if (status.state !== 'ready') return
  autoUpdater.quitAndInstall()
}

/** Quiet check shortly after launch, so users drift toward current on their own. */
export function scheduleBackgroundCheck(): void {
  if (!app.isPackaged) return
  setTimeout(() => void checkForUpdates(), 10_000)
  setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1000)
}
