import { create } from 'zustand'
import { DEFAULT_URL, type LayoutNode, type PanelState, type TabState, type TabUpdate } from '@shared/types'
import {
  buildPreset,
  newPanelId,
  newTabId,
  panelIds,
  removePanel,
  resizeAt,
  splitPanel,
  type SplitEdge
} from '../layout/tree'

// --- native-side mirror -----------------------------------------------------
// What currently exists in the main process, kept outside React state so
// reconciliation never triggers a re-render on its own.
const livePanels = new Set<string>()
const liveTabs = new Map<string, Set<string>>() // panelId → tabIds
const activeSent = new Map<string, string>() // panelId → last activated tabId

let saveTimer: ReturnType<typeof setTimeout> | null = null

interface WorkspaceStore {
  ready: boolean
  layout: LayoutNode
  panels: Record<string, PanelState>
  focusedPanelId: string | null

  init(): Promise<void>
  split(panelId: string, edge: SplitEdge): void
  closePanel(panelId: string): void
  applyPreset(count: 1 | 2 | 4): void
  resizeSplit(path: number[], sizes: [number, number]): void
  focusPanel(panelId: string): void

  addTab(panelId: string): void
  closeTab(panelId: string, tabId: string): void
  activateTab(panelId: string, tabId: string): void

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

export const useWorkspace = create<WorkspaceStore>((set, get) => {
  /** Sync native panels/tabs + persistence to match the current logical state. */
  function commit(layout: LayoutNode, panels: Record<string, PanelState>, focusedPanelId: string | null): void {
    const desired = new Set(panelIds(layout))

    // Prune orphaned PanelState first so we always have data for reconcile.
    const pruned: Record<string, PanelState> = {}
    for (const id of desired) pruned[id] = panels[id] ?? freshPanel(id)

    // Create/refresh panels + their tabs.
    for (const panelId of desired) {
      const ps = pruned[panelId]
      if (!livePanels.has(panelId)) {
        livePanels.add(panelId)
        liveTabs.set(panelId, new Set())
        void window.workspace.ensurePanel(panelId)
      }
      const tabSet = liveTabs.get(panelId)!
      // Create new tabs.
      for (const tab of ps.tabs) {
        if (!tabSet.has(tab.id)) {
          tabSet.add(tab.id)
          void window.workspace.createTab(panelId, tab.id, tab.url)
        }
      }
      // Destroy removed tabs.
      const wanted = new Set(ps.tabs.map((t) => t.id))
      for (const tabId of [...tabSet]) {
        if (!wanted.has(tabId)) {
          tabSet.delete(tabId)
          void window.workspace.destroyTab(panelId, tabId)
        }
      }
      // Activate the active tab if it changed.
      if (activeSent.get(panelId) !== ps.activeTabId) {
        activeSent.set(panelId, ps.activeTabId)
        void window.workspace.activateTab(panelId, ps.activeTabId)
      }
    }

    // Destroy panels that vanished.
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

  function scheduleSave(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const { layout, panels, focusedPanelId } = get()
      void window.workspace.saveWorkspace({ version: 2, layout, panels, focusedPanelId })
    }, 400)
  }

  /** Immutably replace one panel's state and re-commit. */
  function updatePanel(panelId: string, next: PanelState): void {
    const { layout, panels, focusedPanelId } = get()
    commit(layout, { ...panels, [panelId]: next }, focusedPanelId)
  }

  return {
    ready: false,
    layout: { type: 'panel', id: 'bootstrap' },
    panels: {},
    focusedPanelId: null,

    async init() {
      const saved = await window.workspace.loadWorkspace()
      window.workspace.onTabUpdate((u) => get().applyTabUpdate(u))

      if (saved && panelIds(saved.layout).length > 0) {
        commit(saved.layout, saved.panels, saved.focusedPanelId)
      } else {
        const id = newPanelId()
        commit({ type: 'panel', id }, { [id]: freshPanel(id) }, id)
      }
      set({ ready: true })
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
        // Last tab closed: close the whole panel, unless it is the only panel —
        // then replace it with a fresh blank tab so a panel always has content.
        if (panelIds(layout).length > 1) {
          get().closePanel(panelId)
        } else {
          updatePanel(panelId, freshPanel(panelId))
        }
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

/** Immutably merge a partial update into a single tab. Undefined fields are ignored. */
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
