# Workspace Browser (multibrowser)

A Chromium-based **workspace browser** where the primary object is **panels, not tabs**.
A single window holds many fully independent browser panels side by side — built for
developers, traders, and researchers who need many live web apps visible at once.

Feels like VS Code / Obsidian / Figma, not like Chrome.

## Status

**Phase 1 MVP — done**

- ✅ Electron shell (real Chromium `WebContentsView`, no iframes)
- ✅ Browser panel with URL bar + Back / Forward / Reload / Stop
- ✅ Independent session per panel (isolated cookies / cache / storage)
- ✅ Split any panel Left / Right / Top / Bottom
- ✅ Preset layouts: 1 / 2 / 4 panels
- ✅ Drag dividers to resize
- ✅ Locked layout (no floating windows — everything stays docked)
- ✅ Automatic layout save + restore

**Phase 2 — in progress**

- ✅ Tabs inside panels (each tab its own `WebContentsView`, sharing the panel session)
- ✅ Workspace manager — multiple named workspaces, left-rail switcher, create / rename / delete, per-workspace saved sessions
- ✅ Keyboard shortcuts (resolved in main via `before-input-event`, so they fire even while a web page has focus)
- ✅ Command palette (Ctrl+K)
- ⬜ Drag-and-drop layout editing

Persistence is versioned (v1 → v2 → v3) with automatic migration on load.

### Keyboard

| Shortcut | Action | | Shortcut | Action |
|---|---|---|---|---|
| `Ctrl K` | Command palette | | `Ctrl \` | Split panel right |
| `Ctrl T` | New tab | | `Ctrl Shift \` | Split panel down |
| `Ctrl W` | Close tab | | `Ctrl Shift W` | Close panel |
| `Ctrl Tab` | Next tab | | `Ctrl Shift N` | New workspace |
| `Ctrl L` | Focus address bar | | `Ctrl Alt 1/2/4` | Layout preset |
| `Ctrl R` | Reload | | `Alt ←` / `Alt →` | Back / Forward |

Not built yet (Phase 3): sleeping/performance modes, templates, multi-monitor,
plugins, cloud sync.

## Architecture

Real Chromium panels are native `WebContentsView`s owned by the **main** process.
The **renderer** (React) owns the layout tree + state and draws the chrome (per-panel
URL bars, dividers); it measures each panel's viewport rectangle and tells main where
to position the native view. There are **no iframes** — every panel is a real browser.

```
src/
  shared/      types + IPC contract (main ⇄ preload ⇄ renderer)
  main/        Electron main; owns WebContentsViews + persistence
    workspace/ WorkspaceManager, Panel (tab container), Tab, persistence
  preload/     contextBridge → window.workspace
  renderer/    React + Zustand + Tailwind
    layout/    pure binary split-tree engine
    store/     workspace store (state, native reconcile, autosave, workspaces)
    components/ WorkspaceRail, Toolbar, WorkspaceView (splitters),
                PanelFrame, TabStrip
```

Only the **active** workspace has live native panels; switching workspaces tears
them down and rebuilds the target's (on-disk sessions persist, so logins survive).

The layout is a **binary split tree** — a node is either a panel or a split of two
children — which yields 1 / 2 / 4 / N layouts and arbitrary resizing from one model.

Stack: Electron · TypeScript · React · Vite (electron-vite) · Zustand · TailwindCSS.

## Getting started

```bash
npm install
npm run dev        # hot-reloading dev build
```

Other scripts:

```bash
npm run build      # production build into out/
npm start          # preview the built app
npm run typecheck  # typecheck main + renderer
```

The workspace is autosaved to `workspace.json` in Electron's `userData` directory and
restored on next launch.
