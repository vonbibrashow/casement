import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { DEFAULT_URL, type PanelState, type WorkspaceState } from '@shared/types'

// The workspace session is persisted as a single JSON document in userData.
const filePath = (): string => join(app.getPath('userData'), 'workspace.json')

export async function loadWorkspace(): Promise<WorkspaceState | null> {
  try {
    const raw = await readFile(filePath(), 'utf8')
    const parsed = JSON.parse(raw) as { version?: number; layout?: unknown; panels?: unknown }
    if (!parsed || !parsed.layout || !parsed.panels) return null
    if (parsed.version === 2) return parsed as unknown as WorkspaceState
    if (parsed.version === 1) return migrateV1(parsed as V1Workspace)
    return null
  } catch {
    return null
  }
}

export async function saveWorkspace(state: WorkspaceState): Promise<void> {
  const target = filePath()
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, JSON.stringify(state, null, 2), 'utf8')
}

// ---- migration from the Phase 1 (single-url) format ------------------------

interface V1Panel {
  id: string
  url: string
  title?: string
}
interface V1Workspace {
  version: 1
  layout: WorkspaceState['layout']
  panels: Record<string, V1Panel>
  focusedPanelId: string | null
}

function migrateV1(v1: V1Workspace): WorkspaceState {
  const panels: Record<string, PanelState> = {}
  for (const [id, p] of Object.entries(v1.panels)) {
    const tabId = `${id}::t0`
    panels[id] = {
      id,
      activeTabId: tabId,
      tabs: [
        {
          id: tabId,
          url: p.url ?? DEFAULT_URL,
          title: p.title ?? 'New Tab',
          canGoBack: false,
          canGoForward: false,
          isLoading: false
        }
      ]
    }
  }
  return { version: 2, layout: v1.layout, panels, focusedPanelId: v1.focusedPanelId }
}
