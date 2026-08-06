import { dialog, type BrowserWindow } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import type { AppState } from '@shared/types'
import { parseAppJson } from './persistence'

// Workspace sync via a portable file. Point export/import at a folder that a
// cloud drive (Drive / Dropbox / iCloud) syncs and you get cross-machine
// workspace sync with no backend. A hosted provider can be layered on the same
// AppState document later (that part needs infrastructure + auth to supply).

export async function exportApp(win: BrowserWindow, state: AppState): Promise<boolean> {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export Workspaces',
    defaultPath: 'casement-workspaces.json',
    filters: [{ name: 'Workspace Sync', extensions: ['json'] }]
  })
  if (canceled || !filePath) return false
  await writeFile(filePath, JSON.stringify(state, null, 2), 'utf8')
  return true
}

export async function importApp(win: BrowserWindow): Promise<AppState | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Import Workspaces',
    properties: ['openFile'],
    filters: [{ name: 'Workspace Sync', extensions: ['json'] }]
  })
  if (canceled || filePaths.length === 0) return null
  try {
    return parseAppJson(await readFile(filePaths[0], 'utf8'))
  } catch {
    return null
  }
}
