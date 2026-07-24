import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { DEFAULT_URL, type AppState, type LayoutNode, type PanelState, type WorkspaceDoc } from '@shared/types'

// The whole app (all workspaces) is persisted as a single JSON document.
const filePath = (): string => join(app.getPath('userData'), 'workspace.json')

export async function loadApp(): Promise<AppState | null> {
  try {
    const raw = await readFile(filePath(), 'utf8')
    const parsed = JSON.parse(raw) as { version?: number }
    if (!parsed || typeof parsed.version !== 'number') return null
    if (parsed.version === 3) {
      const v3 = parsed as unknown as AppState
      return v3.workspaces?.length ? v3 : null
    }
    if (parsed.version === 2) return wrapSingle(migrateTabs(parsed as unknown as V2Workspace))
    if (parsed.version === 1) return wrapSingle(migrateV1ToV2(parsed as unknown as V1Workspace))
    return null
  } catch {
    return null
  }
}

export async function saveApp(state: AppState): Promise<void> {
  const target = filePath()
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, JSON.stringify(state, null, 2), 'utf8')
}

// ---- migrations ------------------------------------------------------------

interface V1Panel {
  id: string
  url: string
  title?: string
}
interface V1Workspace {
  version: 1
  layout: LayoutNode
  panels: Record<string, V1Panel>
  focusedPanelId: string | null
}
interface V2Workspace {
  version: 2
  layout: LayoutNode
  panels: Record<string, PanelState>
  focusedPanelId: string | null
}

/** v1 (one url per panel) → v2 (one tab per panel). */
function migrateV1ToV2(v1: V1Workspace): V2Workspace {
  const panels: Record<string, PanelState> = {}
  for (const [id, p] of Object.entries(v1.panels)) {
    const tabId = `${id}::t0`
    panels[id] = {
      id,
      activeTabId: tabId,
      tabs: [
        { id: tabId, url: p.url ?? DEFAULT_URL, title: p.title ?? 'New Tab', canGoBack: false, canGoForward: false, isLoading: false }
      ]
    }
  }
  return { version: 2, layout: v1.layout, panels, focusedPanelId: v1.focusedPanelId }
}

const migrateTabs = (v2: V2Workspace): V2Workspace => v2

/** Wrap a single legacy workspace into the multi-workspace v3 envelope. */
function wrapSingle(v2: V2Workspace): AppState {
  const doc: WorkspaceDoc = {
    id: 'workspace-default',
    name: 'Workspace',
    icon: '🗂️',
    layout: v2.layout,
    panels: v2.panels,
    focusedPanelId: v2.focusedPanelId
  }
  return { version: 3, workspaces: [doc], activeWorkspaceId: doc.id }
}
