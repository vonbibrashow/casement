import { create } from 'zustand'
import {
  DEFAULT_URL,
  type LayoutNode,
  type PanelState,
  type TabState,
  type TabUpdate,
  type WorkspaceDoc,
  type WorkspaceMeta
} from '@shared/types'
import {
  buildPreset,
  newPanelId,
  newTabId,
  newWorkspaceId,
  panelIds,
  removePanel,
  resizeAt,
  splitPanel,
  type SplitEdge
} from '../layout/tree'

// --- native-side mirror (active workspace only) -----------------------------
// Only the active workspace has live WebContentsViews. Switching workspaces
// tears these down and rebuilds the target's — sessions persist on disk, so
// logins survive. Kept outside React state so reconcile never re-renders.
const livePanels = new Set<string>()
const liveTabs = new Map<string, Set<string>>()
const activeSent = new Map<string, string>()

let saveTimer: ReturnType<typeof setTimeout> | null = null

const WORKSPACE_ICONS = ['🗂️', '💻', '🔬', '📈', '🎨', '📝', '🌐', '🎧', '🧪', '📚']

interface WorkspaceStore {
  ready: boolean

  // All workspaces (switcher metadata) + which is active.
  workspaces: WorkspaceMeta[]
  activeWorkspaceId: string

  // Working state of the ACTIVE workspace (what the panels render).
  layout: LayoutNode
  panels: Record<string, PanelState>
  focusedPanelId: string | null

  // Command palette overlay.
  paletteOpen: boolean
  openPalette(): void
  closePalette(): void

  /** Set focus without re-focusing native content (used for focus echoes). */
  setFocusedPanel(id: string): void

  init(): Promise<void>

  // workspace management
  switchWorkspace(id: string): void
  createWorkspace(): void
  renameWorkspace(id: string, name: string): void
  deleteWorkspace(id: string): void

  // layout
  split(panelId: string, edge: SplitEdge): void
  closePanel(panelId: string): void
  applyPreset(count: 1 | 2 | 4): void
  resizeSplit(path: number[], sizes: [number, number]): void
  focusPanel(panelId: string): void

  // tabs
  addTab(panelId: string): void
  closeTab(panelId: string, tabId: string): void
  activateTab(panelId: string, tabId: string): void

  // navigation
  navigate(panelId: string, tabId: string, url: string): void
  back(panelId: string, tabId: string): void
  forward(panelId: string, tabId: string): void
  reload(panelId: string, tabId: string): void
  stop(panelId: string, tabId: string): void

  applyTabUpdate(update: TabUpdate): void
}

function freshTab(url = DEFAULT_URL): TabState {
  return { id: newTabId(), url, title: 'New Tab', canGoBack: false, canGoForward: false, isLoading: false }
}
function freshPanel(id: string): PanelState {
  const tab = freshTab()
  return { id, tabs: [tab], activeTabId: tab.id }
}
function freshWorkspaceBody(): Pick<WorkspaceDoc, 'layout' | 'panels' | 'focusedPanelId'> {
  const id = newPanelId()
  return { layout: { type: 'panel', id }, panels: { [id]: freshPanel(id) }, focusedPanelId: id }
}

// Full docs for non-active workspaces (layout/panels/focused only; name/icon
// live authoritatively in the `workspaces` meta list).
const inactiveDocs = new Map<string, Pick<WorkspaceDoc, 'layout' | 'panels' | 'focusedPanelId'>>()

export const useWorkspace = create<WorkspaceStore>((set, get) => {
  /** Reconcile native panels/tabs of the ACTIVE workspace + schedule a save. */
  function commit(layout: LayoutNode, panels: Record<string, PanelState>, focusedPanelId: string | null): void {
    const desired = new Set(panelIds(layout))
    const pruned: Record<string, PanelState> = {}
    for (const id of desired) pruned[id] = panels[id] ?? freshPanel(id)

    for (const panelId of desired) {
      const ps = pruned[panelId]
      if (!livePanels.has(panelId)) {
        livePanels.add(panelId)
        liveTabs.set(panelId, new Set())
        void window.workspace.ensurePanel(panelId)
      }
      const tabSet = liveTabs.get(panelId)!
      for (const tab of ps.tabs) {
        if (!tabSet.has(tab.id)) {
          tabSet.add(tab.id)
          void window.workspace.createTab(panelId, tab.id, tab.url)
        }
      }
      const wanted = new Set(ps.tabs.map((t) => t.id))
      for (const tabId of [...tabSet]) {
        if (!wanted.has(tabId)) {
          tabSet.delete(tabId)
          void window.workspace.destroyTab(panelId, tabId)
        }
      }
      if (activeSent.get(panelId) !== ps.activeTabId) {
        activeSent.set(panelId, ps.activeTabId)
        void window.workspace.activateTab(panelId, ps.activeTabId)
      }
    }

    for (const panelId of [...livePanels]) {
      if (!desired.has(panelId)) {
        livePanels.delete(panelId)
        liveTabs.delete(panelId)
        activeSent.delete(panelId)
        void window.workspace.destroyPanel(panelId)
      }
    }

    set({ layout, panels: pruned, focusedPanelId })
    scheduleSave()
  }

  function buildAppState() {
    const { workspaces, activeWorkspaceId, layout, panels, focusedPanelId } = get()
    const docs: WorkspaceDoc[] = workspaces.map((m) => {
      const body =
        m.id === activeWorkspaceId
          ? { layout, panels, focusedPanelId }
          : inactiveDocs.get(m.id) ?? freshWorkspaceBody()
      return { id: m.id, name: m.name, icon: m.icon, ...body }
    })
    return { version: 3 as const, workspaces: docs, activeWorkspaceId }
  }

  function scheduleSave(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void window.workspace.saveApp(buildAppState()), 400)
  }

  function updatePanel(panelId: string, next: PanelState): void {
    const { layout, panels, focusedPanelId } = get()
    commit(layout, { ...panels, [panelId]: next }, focusedPanelId)
  }

  /** Snapshot the current active workspace's body into the inactive store. */
  function stashActive(): void {
    const { activeWorkspaceId, layout, panels, focusedPanelId } = get()
    inactiveDocs.set(activeWorkspaceId, { layout, panels, focusedPanelId })
  }

  return {
    ready: false,
    workspaces: [],
    activeWorkspaceId: '',
    layout: { type: 'panel', id: 'bootstrap' },
    panels: {},
    focusedPanelId: null,
    paletteOpen: false,

    openPalette: () => set({ paletteOpen: true }),
    closePalette: () => set({ paletteOpen: false }),
    setFocusedPanel: (id) => {
      if (get().focusedPanelId !== id) {
        set({ focusedPanelId: id })
        scheduleSave()
      }
    },

    async init() {
      const appState = await window.workspace.loadApp()
      window.workspace.onTabUpdate((u) => get().applyTabUpdate(u))

      if (appState && appState.workspaces.length > 0) {
        const active = appState.workspaces.find((w) => w.id === appState.activeWorkspaceId) ?? appState.workspaces[0]
        inactiveDocs.clear()
        for (const w of appState.workspaces) {
          if (w.id !== active.id) {
            inactiveDocs.set(w.id, { layout: w.layout, panels: w.panels, focusedPanelId: w.focusedPanelId })
          }
        }
        set({
          workspaces: appState.workspaces.map(({ id, name, icon }) => ({ id, name, icon })),
          activeWorkspaceId: active.id
        })
        commit(active.layout, active.panels, active.focusedPanelId)
      } else {
        const id = newWorkspaceId()
        set({ workspaces: [{ id, name: 'Workspace', icon: WORKSPACE_ICONS[0] }], activeWorkspaceId: id })
        const body = freshWorkspaceBody()
        commit(body.layout, body.panels, body.focusedPanelId)
      }
      set({ ready: true })
    },

    switchWorkspace(id) {
      const { activeWorkspaceId } = get()
      if (id === activeWorkspaceId || !get().workspaces.some((w) => w.id === id)) return
      stashActive()
      const target = inactiveDocs.get(id) ?? freshWorkspaceBody()
      inactiveDocs.delete(id)
      set({ activeWorkspaceId: id })
      commit(target.layout, target.panels, target.focusedPanelId)
    },

    createWorkspace() {
      stashActive()
      const id = newWorkspaceId()
      const { workspaces } = get()
      const icon = WORKSPACE_ICONS[workspaces.length % WORKSPACE_ICONS.length]
      set({
        workspaces: [...workspaces, { id, name: `Workspace ${workspaces.length + 1}`, icon }],
        activeWorkspaceId: id
      })
      const body = freshWorkspaceBody()
      commit(body.layout, body.panels, body.focusedPanelId)
    },

    renameWorkspace(id, name) {
      const trimmed = name.trim()
      if (!trimmed) return
      set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name: trimmed } : w)) }))
      scheduleSave()
    },

    deleteWorkspace(id) {
      const { workspaces, activeWorkspaceId } = get()
      if (workspaces.length <= 1) return
      if (id === activeWorkspaceId) {
        const target = workspaces.find((w) => w.id !== id)!
        get().switchWorkspace(target.id) // tears down this workspace's native panels
      }
      inactiveDocs.delete(id)
      set((s) => ({ workspaces: s.workspaces.filter((w) => w.id !== id) }))
      scheduleSave()
    },

    split(panelId, edge) {
      const { layout, panels } = get()
      const id = newPanelId()
      commit(splitPanel(layout, panelId, edge, id), { ...panels, [id]: freshPanel(id) }, id)
    },

    closePanel(panelId) {
      const { layout, panels, focusedPanelId } = get()
      if (panelIds(layout).length <= 1) return
      const nextLayout = removePanel(layout, panelId)
      if (!nextLayout) return
      const nextFocus = focusedPanelId === panelId ? panelIds(nextLayout)[0] : focusedPanelId
      commit(nextLayout, panels, nextFocus)
    },

    applyPreset(count) {
      const { layout, panels } = get()
      const existing = panelIds(layout)
      const ids: string[] = []
      const nextPanels: Record<string, PanelState> = {}
      for (let i = 0; i < count; i++) {
        const id = existing[i] ?? newPanelId()
        ids.push(id)
        nextPanels[id] = panels[id] ?? freshPanel(id)
      }
      commit(buildPreset(count, ids), nextPanels, ids[0])
    },

    resizeSplit(path, sizes) {
      set((s) => ({ layout: resizeAt(s.layout, path, sizes) }))
      scheduleSave()
    },

    focusPanel(panelId) {
      set({ focusedPanelId: panelId })
      void window.workspace.focusPanel(panelId)
      scheduleSave()
    },

    addTab(panelId) {
      const panel = get().panels[panelId]
      if (!panel) return
      const tab = freshTab()
      updatePanel(panelId, { ...panel, tabs: [...panel.tabs, tab], activeTabId: tab.id })
      set({ focusedPanelId: panelId })
    },

    closeTab(panelId, tabId) {
      const { layout, panels } = get()
      const panel = panels[panelId]
      if (!panel) return
      const remaining = panel.tabs.filter((t) => t.id !== tabId)
      if (remaining.length === 0) {
        if (panelIds(layout).length > 1) get().closePanel(panelId)
        else updatePanel(panelId, freshPanel(panelId))
        return
      }
      const activeTabId =
        panel.activeTabId === tabId
          ? remaining[Math.min(panel.tabs.findIndex((t) => t.id === tabId), remaining.length - 1)].id
          : panel.activeTabId
      updatePanel(panelId, { ...panel, tabs: remaining, activeTabId })
    },

    activateTab(panelId, tabId) {
      const panel = get().panels[panelId]
      if (!panel || panel.activeTabId === tabId) {
        set({ focusedPanelId: panelId })
        return
      }
      updatePanel(panelId, { ...panel, activeTabId: tabId })
      set({ focusedPanelId: panelId })
    },

    navigate(panelId, tabId, url) {
      set((s) => ({ panels: patchTab(s.panels, panelId, tabId, { url }) }))
      void window.workspace.navigate(panelId, tabId, url)
    },

    back: (panelId, tabId) => void window.workspace.back(panelId, tabId),
    forward: (panelId, tabId) => void window.workspace.forward(panelId, tabId),
    reload: (panelId, tabId) => void window.workspace.reload(panelId, tabId),
    stop: (panelId, tabId) => void window.workspace.stop(panelId, tabId),

    applyTabUpdate(update) {
      set((s) => ({
        panels: patchTab(s.panels, update.panelId, update.tabId, {
          url: update.url,
          title: update.title,
          canGoBack: update.canGoBack,
          canGoForward: update.canGoForward,
          isLoading: update.isLoading
        })
      }))
      scheduleSave()
    }
  }
})

function patchTab(
  panels: Record<string, PanelState>,
  panelId: string,
  tabId: string,
  patch: Partial<TabState>
): Record<string, PanelState> {
  const panel = panels[panelId]
  if (!panel) return panels
  const tabs = panel.tabs.map((t) => {
    if (t.id !== tabId) return t
    const merged = { ...t }
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (merged as Record<string, unknown>)[k] = v
    }
    return merged
  })
  return { ...panels, [panelId]: { ...panel, tabs } }
}
