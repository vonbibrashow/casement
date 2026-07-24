import { create } from 'zustand'
import { DEFAULT_URL, type LayoutNode, type PanelState, type PanelUpdate } from '@shared/types'
import {
  buildPreset,
  newPanelId,
  panelIds,
  removePanel,
  resizeAt,
  splitPanel,
  type SplitEdge
} from '../layout/tree'

// Native WebContentsViews currently alive in the main process. Kept outside
// React state so reconciliation never triggers a re-render on its own.
const livePanels = new Set<string>()

let saveTimer: ReturnType<typeof setTimeout> | null = null

interface WorkspaceStore {
  ready: boolean
  layout: LayoutNode
  panels: Record<string, PanelState>
  focusedPanelId: string | null

  init(): Promise<void>
  split(targetId: string, edge: SplitEdge): void
  closePanel(id: string): void
  applyPreset(count: 1 | 2 | 4): void
  resizeSplit(path: number[], sizes: [number, number]): void
  focusPanel(id: string): void
  navigate(id: string, url: string): void
  back(id: string): void
  forward(id: string): void
  reload(id: string): void
  stop(id: string): void
  applyUpdate(update: PanelUpdate): void
}

function freshPanel(id: string, url = DEFAULT_URL): PanelState {
  return { id, url, title: 'New Panel', canGoBack: false, canGoForward: false, isLoading: false }
}

export const useWorkspace = create<WorkspaceStore>((set, get) => {
  /** Sync native panels + persistence to match the current logical state. */
  function commit(layout: LayoutNode, panels: Record<string, PanelState>, focusedPanelId: string | null): void {
    const desired = new Set(panelIds(layout))

    // Create panels that appeared.
    for (const id of desired) {
      if (!livePanels.has(id)) {
        livePanels.add(id)
        void window.workspace.createPanel({ id, url: panels[id]?.url ?? DEFAULT_URL })
      }
    }
    // Destroy panels that vanished.
    for (const id of [...livePanels]) {
      if (!desired.has(id)) {
        livePanels.delete(id)
        void window.workspace.destroyPanel(id)
      }
    }

    // Drop orphaned PanelState entries.
    const prunedPanels: Record<string, PanelState> = {}
    for (const id of desired) prunedPanels[id] = panels[id] ?? freshPanel(id)

    set({ layout, panels: prunedPanels, focusedPanelId })
    scheduleSave()
  }

  function scheduleSave(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const { layout, panels, focusedPanelId } = get()
      void window.workspace.saveWorkspace({ version: 1, layout, panels, focusedPanelId })
    }, 400)
  }

  return {
    ready: false,
    layout: { type: 'panel', id: 'bootstrap' },
    panels: {},
    focusedPanelId: null,

    async init() {
      const saved = await window.workspace.loadWorkspace()
      window.workspace.onPanelUpdate((u) => get().applyUpdate(u))

      if (saved && panelIds(saved.layout).length > 0) {
        commit(saved.layout, saved.panels, saved.focusedPanelId)
      } else {
        const id = newPanelId()
        commit({ type: 'panel', id }, { [id]: freshPanel(id) }, id)
      }
      set({ ready: true })
    },

    split(targetId, edge) {
      const { layout, panels } = get()
      const id = newPanelId()
      const nextLayout = splitPanel(layout, targetId, edge, id)
      commit(nextLayout, { ...panels, [id]: freshPanel(id) }, id)
    },

    closePanel(id) {
      const { layout, panels, focusedPanelId } = get()
      if (panelIds(layout).length <= 1) return // never close the last panel
      const nextLayout = removePanel(layout, id)
      if (!nextLayout) return
      const nextFocus = focusedPanelId === id ? panelIds(nextLayout)[0] : focusedPanelId
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
      const { layout, panels, focusedPanelId } = get()
      // Resize is high-frequency during drag — update state but debounce the save.
      set({ layout: resizeAt(layout, path, sizes) })
      void panels
      void focusedPanelId
      scheduleSave()
    },

    focusPanel(id) {
      set({ focusedPanelId: id })
      void window.workspace.focusPanel(id)
      scheduleSave()
    },

    navigate(id, url) {
      set((s) => ({ panels: { ...s.panels, [id]: { ...s.panels[id], url } } }))
      void window.workspace.navigate(id, url)
    },

    back: (id) => void window.workspace.back(id),
    forward: (id) => void window.workspace.forward(id),
    reload: (id) => void window.workspace.reload(id),
    stop: (id) => void window.workspace.stop(id),

    applyUpdate(update) {
      set((s) => {
        const prev = s.panels[update.id]
        if (!prev) return s
        return {
          panels: {
            ...s.panels,
            [update.id]: {
              ...prev,
              url: update.url ?? prev.url,
              title: update.title ?? prev.title,
              canGoBack: update.canGoBack ?? prev.canGoBack,
              canGoForward: update.canGoForward ?? prev.canGoForward,
              isLoading: update.isLoading ?? prev.isLoading
            }
          }
        }
      })
      scheduleSave()
    }
  }
})
