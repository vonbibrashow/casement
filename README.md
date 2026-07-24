# Workspace Browser (multibrowser)

A Chromium-based **workspace browser** where the primary object is **panels, not tabs**.
A single window holds many fully independent browser panels side by side — built for
developers, traders, and researchers who need many live web apps visible at once.

Feels like VS Code / Obsidian / Figma, not like Chrome.

## Status — Phase 1 MVP

Implemented:

- ✅ Electron shell (real Chromium, one `WebContentsView` per panel)
- ✅ A browser panel with URL bar + Back / Forward / Reload / Stop
- ✅ Independent session per panel (isolated cookies / cache / storage)
- ✅ Split any panel Left / Right / Top / Bottom
- ✅ Preset layouts: 1 / 2 / 4 panels
- ✅ Drag dividers to resize
- ✅ Locked layout (no floating windows — everything stays docked)
- ✅ Automatic layout save + restore (close and reopen restores the workspace)

Not built yet (later phases, per spec): tabs-in-panels, workspace manager,
sleeping/performance modes, templates, command palette, plugins, sync.

## Architecture

Real Chromium panels are native `WebContentsView`s owned by the **main** process.
The **renderer** (React) owns the layout tree + state and draws the chrome (per-panel
URL bars, dividers); it measures each panel's viewport rectangle and tells main where
to position the native view. There are **no iframes** — every panel is a real browser.

```
src/
  shared/      types + IPC contract (main ⇄ preload ⇄ renderer)
  main/        Electron main; owns WebContentsViews + persistence
    workspace/ WorkspaceManager, Panel, persistence
  preload/     contextBridge → window.workspace
  renderer/    React + Zustand + Tailwind
    layout/    pure binary split-tree engine
    store/     workspace store (state, native-panel reconcile, autosave)
    components/ Toolbar, WorkspaceView (splitters), PanelFrame
```

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
