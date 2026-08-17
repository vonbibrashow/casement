import { create } from 'zustand'
import {
  DEFAULT_URL,
  type AppSettings,
  type AppState,
  type LayoutNode,
  type PanelState,
  type ShareInfo,
  type TabState,
  type TabUpdate,
  type WorkspaceDoc,
  type WorkspaceMeta
} from '@shared/types'
import {
  buildPreset,
  movePanel,
  newPanelId,
  newTabId,
  newWorkspaceId,
  panelIds,
  removePanel,
  resizeAt,
  splitPanel,
  type SplitEdge
} from '../layout/tree'
import { buildTemplateBody, type WorkspaceTemplate } from '../templates'

export interface DropTarget {
  panelId: string
  edge: SplitEdge
}

// --- native-side mirror (active workspace only) -----------------------------
// Only the active workspace has live WebContentsViews. Switching workspaces
// tears these down and rebuilds the target's — sessions persist on disk, so
// logins survive. Kept outside React state so reconcile never re-renders.
const livePanels = new Set<string>()
const liveTabs = new Map<string, Set<string>>()
const activeSent = new Map<string, string>()

// Performance manager: idle background tabs are put to sleep (their
// WebContentsView is destroyed to free memory) and reloaded on activation.
const lastActive = new Map<string, number>() // tabId → last time it was the active tab
let perfTimer: ReturnType<typeof setInterval> | null = null
// Tunable from Settings; these are the fallbacks until settings load.
let sleepAfterMs = 5 * 60 * 1000 // sleep a background tab idle this long
let maxLiveTabs = 16 // cap on simultaneously-loaded tabs (LRU sleeps the rest)
let newTabUrl = DEFAULT_URL

/** Applied whenever settings change, so tuning takes effect without a restart. */
export function applyPerformanceSettings(s: { sleepAfterMinutes: number; maxLiveTabs: number; newTabUrl: string }): void {
  sleepAfterMs = Math.max(1, s.sleepAfterMinutes) * 60 * 1000
  maxLiveTabs = Math.max(1, s.maxLiveTabs)
  newTabUrl = s.newTabUrl || DEFAULT_URL
}
const PERF_TICK_MS = 30_000

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

  // Command palette + plugins modal overlays.
  paletteOpen: boolean
  openPalette(): void
  closePalette(): void
  pluginsOpen: boolean
  openPlugins(): void
  closePlugins(): void
  privacyOpen: boolean
  openPrivacy(): void
  closePrivacy(): void
  aboutOpen: boolean
  openAbout(): void
  closeAbout(): void
  settingsOpen: boolean
  openSettings(): void
  closeSettings(): void
  historyOpen: boolean
  openHistory(): void
  closeHistory(): void

  /** User preferences, loaded from main at startup. */
  settings: AppSettings | null
  updateSettings(next: Partial<AppSettings>): Promise<void>

  /** Real state of the autosave, so the indicator can report a failure. */
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  lastSavedAt: number | null
  saveError: string | null

  // Panel sharing (remote guests).
  shares: ShareInfo[]
  sharePanelId: string | null
  openShare(panelId: string): Promise<void>
  closeShare(): void
  stopShare(panelId: string): Promise<void>
  setShareControl(panelId: string, allow: boolean): Promise<void>
  kickShareClient(panelId: string, clientId: string): Promise<void>
  approveShareGuest(panelId: string, requestId: string): Promise<void>
  denyShareGuest(panelId: string, requestId: string): Promise<void>
  setShareApproval(panelId: string, require: boolean): Promise<void>
  startShareTunnel(): Promise<void>
  stopShareTunnel(): Promise<void>

  // Panel drag-and-drop docking.
  draggingPanelId: string | null
  dropTarget: DropTarget | null
  dragPos: { x: number; y: number } | null
  beginPanelDrag(panelId: string): void
  updatePanelDrag(pos: { x: number; y: number }, target: DropTarget | null): void
  endPanelDrag(): void

  /** Set focus without re-focusing native content (used for focus echoes). */
  setFocusedPanel(id: string): void

  init(): Promise<void>

  // workspace management
  switchWorkspace(id: string): void
  createWorkspace(template?: WorkspaceTemplate): void
  renameWorkspace(id: string, name: string): void
  deleteWorkspace(id: string): void

  // sync (export / import all workspaces via a portable file)
  exportWorkspaces(): void
  importWorkspaces(): Promise<void>

  // layout
  split(panelId: string, edge: SplitEdge): void
  closePanel(panelId: string): void
  applyPreset(count: 1 | 2 | 4): void
  resizeSplit(path: number[], sizes: [number, number]): void
  focusPanel(panelId: string): void

  // tabs
  addTab(panelId: string, url?: string): void
  closeTab(panelId: string, tabId: string): void
  activateTab(panelId: string, tabId: string): void

  // navigation
  navigate(panelId: string, tabId: string, url: string): void
  back(panelId: string, tabId: string): void
  forward(panelId: string, tabId: string): void
  reload(panelId: string, tabId: string): void
  stop(panelId: string, tabId: string): void
  toggleDevTools(panelId: string, tabId: string): void

  // performance
  runPerformancePass(): void
  sleepBackgroundTabs(): void

  applyTabUpdate(update: TabUpdate): void
}

function freshTab(url?: string): TabState {
  const id = newTabId()
  lastActive.set(id, Date.now())
  return { id, url: url ?? newTabUrl, title: 'New Tab', canGoBack: false, canGoForward: false, isLoading: false, status: 'live' }
}
function freshPanel(id: string): PanelState {
  const tab = freshTab()
  return { id, tabs: [tab], activeTabId: tab.id }
}

/**
 * Normalize a workspace's tab statuses when it becomes active: the active tab of
 * each panel is `live`; every other tab starts `sleeping` (not loaded) so a
 * restored/switched workspace only loads what's on screen. Tabs wake on click.
 */
function normalizeStatuses(panels: Record<string, PanelState>): Record<string, PanelState> {
  const now = Date.now()
  const out: Record<string, PanelState> = {}
  for (const [pid, p] of Object.entries(panels)) {
    out[pid] = {
      ...p,
      tabs: p.tabs.map((t) => {
        if (t.id === p.activeTabId) {
          lastActive.set(t.id, now)
          return t.status === 'live' ? t : { ...t, status: 'live' as const }
        }
        return t.status === 'sleeping' ? t : { ...t, status: 'sleeping' as const }
      })
    }
  }
  return out
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
      // A sleeping tab has no native view; everything else does.
      for (const tab of ps.tabs) {
        if (tab.status === 'sleeping') {
          if (tabSet.has(tab.id)) {
            tabSet.delete(tab.id)
            void window.workspace.destroyTab(panelId, tab.id)
          }
        } else if (!tabSet.has(tab.id)) {
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
    // Debounced: a burst of edits collapses into one write.
    saveTimer = setTimeout(() => {
      set({ saveState: 'saving' })
      void window.workspace.saveApp(buildAppState()).then((res) => {
        if (res?.ok) set({ saveState: 'saved', lastSavedAt: Date.now(), saveError: null })
        else set({ saveState: 'error', saveError: res?.error ?? 'Save failed' })
      })
    }, 400)
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

  /** Load a full AppState into the store, replacing all workspaces + panels. */
  function loadAppState(appState: AppState): void {
    const active = appState.workspaces.find((w) => w.id === appState.activeWorkspaceId) ?? appState.workspaces[0]
    inactiveDocs.clear()
    for (const w of appState.workspaces) {
      if (w.id !== active.id) inactiveDocs.set(w.id, { layout: w.layout, panels: w.panels, focusedPanelId: w.focusedPanelId })
    }
    set({
      workspaces: appState.workspaces.map(({ id, name, icon }) => ({ id, name, icon })),
      activeWorkspaceId: active.id
    })
    commit(active.layout, normalizeStatuses(active.panels), active.focusedPanelId)
  }

  return {
    ready: false,
    workspaces: [],
    activeWorkspaceId: '',
    layout: { type: 'panel', id: 'bootstrap' },
    panels: {},
    focusedPanelId: null,
    paletteOpen: false,
    pluginsOpen: false,
    privacyOpen: false,
    aboutOpen: false,
    settingsOpen: false,
    historyOpen: false,
    saveState: 'idle',
    lastSavedAt: null,
    saveError: null,
    draggingPanelId: null,
    dropTarget: null,
    dragPos: null,

    openPalette: () => set({ paletteOpen: true }),
    closePalette: () => set({ paletteOpen: false }),
    openPlugins: () => set({ pluginsOpen: true }),
    closePlugins: () => set({ pluginsOpen: false }),
    openPrivacy: () => set({ privacyOpen: true }),
    closePrivacy: () => set({ privacyOpen: false }),
    openAbout: () => set({ aboutOpen: true }),
    closeAbout: () => set({ aboutOpen: false }),
    openSettings: () => set({ settingsOpen: true }),
    closeSettings: () => set({ settingsOpen: false }),
    openHistory: () => set({ historyOpen: true }),
    closeHistory: () => set({ historyOpen: false }),

    settings: null,
    async updateSettings(next) {
      const merged = await window.workspace.setSettings(next)
      applyPerformanceSettings(merged)
      set({ settings: merged })
    },

    shares: [],
    sharePanelId: null,
    async openShare(panelId) {
      // Opening the dialog starts the share, so a link exists to copy/scan.
      const info = await window.workspace.startShare(panelId)
      set({ sharePanelId: panelId })
      if (info) set({ shares: await window.workspace.listShares() })
    },
    closeShare: () => set({ sharePanelId: null }),
    async stopShare(panelId) {
      await window.workspace.stopShare(panelId)
      set({ shares: await window.workspace.listShares() })
    },
    async setShareControl(panelId, allow) {
      await window.workspace.setShareControl(panelId, allow)
      set({ shares: await window.workspace.listShares() })
    },
    async kickShareClient(panelId, clientId) {
      await window.workspace.kickShareClient(panelId, clientId)
      set({ shares: await window.workspace.listShares() })
    },
    async approveShareGuest(panelId, requestId) {
      await window.workspace.approveShareGuest(panelId, requestId)
      set({ shares: await window.workspace.listShares() })
    },
    async denyShareGuest(panelId, requestId) {
      await window.workspace.denyShareGuest(panelId, requestId)
      set({ shares: await window.workspace.listShares() })
    },
    async setShareApproval(panelId, require) {
      await window.workspace.setShareApproval(panelId, require)
      set({ shares: await window.workspace.listShares() })
    },
    async startShareTunnel() {
      await window.workspace.startShareTunnel()
      set({ shares: await window.workspace.listShares() })
    },
    async stopShareTunnel() {
      await window.workspace.stopShareTunnel()
      set({ shares: await window.workspace.listShares() })
    },

    beginPanelDrag(panelId) {
      // Hide native views so DOM drop indicators are visible above them.
      panelIds(get().layout).forEach((id) => void window.workspace.setPanelVisible(id, false))
      set({ draggingPanelId: panelId, dropTarget: null, dragPos: null })
    },
    updatePanelDrag(pos, target) {
      set({ dragPos: pos, dropTarget: target })
    },
    endPanelDrag() {
      const { draggingPanelId, dropTarget, layout, panels, focusedPanelId } = get()
      if (draggingPanelId && dropTarget && dropTarget.panelId !== draggingPanelId) {
        const next = movePanel(layout, draggingPanelId, dropTarget.panelId, dropTarget.edge)
        commit(next, panels, focusedPanelId) // same panel ids → no native create/destroy
      }
      // Restore native views for the (possibly restructured) layout.
      panelIds(get().layout).forEach((id) => void window.workspace.setPanelVisible(id, true))
      set({ draggingPanelId: null, dropTarget: null, dragPos: null })
    },
    setFocusedPanel: (id) => {
      if (get().focusedPanelId !== id) {
        set({ focusedPanelId: id })
        scheduleSave()
      }
    },

    async init() {
      // Settings first: they decide the new-tab page and the performance budget
      // that the restore below immediately depends on.
      const settings = await window.workspace.getSettings()
      applyPerformanceSettings(settings)
      set({ settings })

      const appState = await window.workspace.loadApp()
      window.workspace.onTabUpdate((u) => get().applyTabUpdate(u))
      window.workspace.onShareUpdate((shares) => set({ shares }))

      if (appState && appState.workspaces.length > 0) {
        loadAppState(appState)
      } else {
        const id = newWorkspaceId()
        set({ workspaces: [{ id, name: 'Workspace', icon: WORKSPACE_ICONS[0] }], activeWorkspaceId: id })
        const body = freshWorkspaceBody()
        commit(body.layout, body.panels, body.focusedPanelId)
      }
      if (!perfTimer) perfTimer = setInterval(() => get().runPerformancePass(), PERF_TICK_MS)
      set({ ready: true })
    },

    switchWorkspace(id) {
      const { activeWorkspaceId } = get()
      if (id === activeWorkspaceId || !get().workspaces.some((w) => w.id === id)) return
      stashActive()
      const target = inactiveDocs.get(id) ?? freshWorkspaceBody()
      inactiveDocs.delete(id)
      set({ activeWorkspaceId: id })
      commit(target.layout, normalizeStatuses(target.panels), target.focusedPanelId)
    },

    createWorkspace(template) {
      stashActive()
      const id = newWorkspaceId()
      const { workspaces } = get()
      const name = template?.name ?? `Workspace ${workspaces.length + 1}`
      const icon = template?.icon ?? WORKSPACE_ICONS[workspaces.length % WORKSPACE_ICONS.length]
      set({ workspaces: [...workspaces, { id, name, icon }], activeWorkspaceId: id })
      const body = template ? buildTemplateBody(template) : freshWorkspaceBody()
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

    exportWorkspaces() {
      void window.workspace.exportApp(buildAppState())
    },

    async importWorkspaces() {
      const imported = await window.workspace.importApp()
      if (imported && imported.workspaces.length > 0) {
        loadAppState(imported)
        scheduleSave()
      }
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

    addTab(panelId, url) {
      const panel = get().panels[panelId]
      if (!panel) return
      const tab = freshTab(url) // live
      // The previously active tab drops to paused (kept warm, may sleep later).
      const tabs = panel.tabs.map((t) => (t.id === panel.activeTabId && t.status === 'live' ? { ...t, status: 'paused' as const } : t))
      updatePanel(panelId, { ...panel, tabs: [...tabs, tab], activeTabId: tab.id })
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
      let activeTabId = panel.activeTabId
      let tabs = remaining
      if (panel.activeTabId === tabId) {
        activeTabId = remaining[Math.min(panel.tabs.findIndex((t) => t.id === tabId), remaining.length - 1)].id
        lastActive.set(activeTabId, Date.now())
        // The newly-surfaced tab must be loaded.
        tabs = remaining.map((t) => (t.id === activeTabId && t.status === 'sleeping' ? { ...t, status: 'live' as const } : t))
      }
      updatePanel(panelId, { ...panel, tabs, activeTabId })
    },

    activateTab(panelId, tabId) {
      const panel = get().panels[panelId]
      if (!panel || panel.activeTabId === tabId) {
        set({ focusedPanelId: panelId })
        return
      }
      const now = Date.now()
      lastActive.set(tabId, now)
      if (panel.activeTabId) lastActive.set(panel.activeTabId, now)
      // New active tab wakes/loads (live); previous active drops to paused.
      const tabs = panel.tabs.map((t) => {
        if (t.id === tabId) return t.status === 'live' ? t : { ...t, status: 'live' as const }
        if (t.id === panel.activeTabId) return t.status === 'paused' ? t : { ...t, status: 'paused' as const }
        return t
      })
      updatePanel(panelId, { ...panel, tabs, activeTabId: tabId })
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
    toggleDevTools: (panelId, tabId) => void window.workspace.toggleDevTools(panelId, tabId),

    runPerformancePass() {
      const { panels } = get()
      const now = Date.now()
      let changed = false

      // 1. Time-based: paused background tabs idle past the threshold go to sleep.
      const next: Record<string, PanelState> = {}
      for (const [pid, p] of Object.entries(panels)) {
        next[pid] = {
          ...p,
          tabs: p.tabs.map((t) => {
            if (t.id !== p.activeTabId && t.status === 'paused' && now - (lastActive.get(t.id) ?? 0) > sleepAfterMs) {
              changed = true
              return { ...t, status: 'sleeping' as const }
            }
            return t
          })
        }
      }

      // 2. Budget: if too many tabs are still loaded, sleep the least-recently-used
      //    background ones until we're back under the cap.
      const loaded: Array<{ pid: string; tid: string; la: number }> = []
      for (const [pid, p] of Object.entries(next)) {
        for (const t of p.tabs) {
          if (t.status !== 'sleeping' && t.id !== p.activeTabId) loaded.push({ pid, tid: t.id, la: lastActive.get(t.id) ?? 0 })
        }
      }
      const activeCount = Object.keys(next).length // one live (active) tab per panel
      let over = activeCount + loaded.length - maxLiveTabs
      if (over > 0) {
        for (const e of loaded.sort((a, b) => a.la - b.la)) {
          if (over <= 0) break
          const p = next[e.pid]
          next[e.pid] = { ...p, tabs: p.tabs.map((t) => (t.id === e.tid ? { ...t, status: 'sleeping' as const } : t)) }
          changed = true
          over--
        }
      }

      if (changed) commit(get().layout, next, get().focusedPanelId)
    },

    sleepBackgroundTabs() {
      const { panels } = get()
      let changed = false
      const next: Record<string, PanelState> = {}
      for (const [pid, p] of Object.entries(panels)) {
        next[pid] = {
          ...p,
          tabs: p.tabs.map((t) => {
            if (t.id !== p.activeTabId && t.status !== 'sleeping') {
              changed = true
              return { ...t, status: 'sleeping' as const }
            }
            return t
          })
        }
      }
      if (changed) commit(get().layout, next, get().focusedPanelId)
    },

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
