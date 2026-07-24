import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { WorkspaceState } from '@shared/types'

// The workspace session is persisted as a single JSON document in userData.
// Save/restore of the whole layout is a Phase 1 MVP deliverable.
const filePath = (): string => join(app.getPath('userData'), 'workspace.json')

export async function loadWorkspace(): Promise<WorkspaceState | null> {
  try {
    const raw = await readFile(filePath(), 'utf8')
    const parsed = JSON.parse(raw) as WorkspaceState
    if (parsed && parsed.version === 1 && parsed.layout && parsed.panels) return parsed
    return null
  } catch {
    // Missing / corrupt file → start fresh.
    return null
  }
}

export async function saveWorkspace(state: WorkspaceState): Promise<void> {
  const target = filePath()
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, JSON.stringify(state, null, 2), 'utf8')
}
