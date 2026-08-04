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

**Phase 2 — done**

- ✅ Tabs inside panels (each tab its own `WebContentsView`, sharing the panel session)
- ✅ Workspace manager — multiple named workspaces, left-rail switcher, create / rename / delete, per-workspace saved sessions
- ✅ Keyboard shortcuts (resolved in main via `before-input-event`, so they fire even while a web page has focus)
- ✅ Command palette (Ctrl+K)
- ✅ Drag-and-drop layout editing — grab a panel's grip and drop it on another panel's edge to re-dock; the moved panel keeps its tabs/session

**Phase 3 — done**

- ✅ Sleeping panels / performance manager — every tab is Live / Paused / Sleeping. Idle background tabs auto-sleep (their `WebContentsView` is destroyed to free memory) and reload instantly on click; a live-tab budget caps memory; on restore only on-screen tabs load. Toolbar shows the live/asleep count.
- ✅ Workspace templates — Developer / Research / Trading / Personal, from the rail `+` menu or the command palette
- ✅ Multi-monitor — move the window between displays (Ctrl+Shift+←/→ or palette) and it reopens on the monitor you left it on
- ✅ Plugin API — internal plugin host with a typed capability surface (contribute commands + templates, open tabs, toggle DevTools); manage/enable in the Plugins modal. Ships three example plugins.
- ✅ Workspace sync — export/import all workspaces to a portable JSON file (put it in a Drive/Dropbox folder for cross-machine sync). A hosted backend for live cloud sync is the one piece that needs infrastructure + auth to supply.

Persistence is versioned (v1 → v2 → v3) with automatic migration on load.

### Panel sharing (remote control)

Share a single panel with someone on a phone or another computer — like AnyDesk,
but scoped to **one browser panel**. Click the share icon in a panel's chrome
(or "Share This Panel…" in the palette) to get a link + QR code.

The guest opens the link in any browser — nothing to install. They see the live
panel and, unless you switch to view-only, can click, type, scroll and navigate
**inside that panel only**: no access to your other panels, workspaces, files, or
the app itself. The share follows the panel's active tab.

How it works: frames stream out of that panel's own `WebContents` via the Chrome
DevTools Protocol screencast; guest input comes back as `Input.dispatch*Event`.
The app runs a small HTTP + WebSocket server ([`src/main/share`](src/main/share))
that starts on the first share and **shuts down when the last one ends** — no
port is open otherwise.

Safety model:

- Links carry a 128-bit token and are compared in constant time; a wrong or
  missing token gets a 404 and the WebSocket upgrade is refused.
- One click stops the share; you can disconnect individual guests, or flip the
  whole session to view-only, at any time.
- Closing the panel (or the app) ends the share automatically.
- **Bound to your local network.** Reaching it from outside needs a VPN or
  tunnel — deliberately not exposed to the internet by default.
- A guest controlling the panel can use **whatever accounts are already signed in
  inside it**. Share only with people you trust, and stop when you're done.

### Plugins

Plugins are internal modules implementing a small `WorkspacePlugin` contract
([`src/renderer/src/plugins`](src/renderer/src/plugins)) and registered with the
`pluginHost`. On activation a plugin gets a `PluginContext` to contribute
commands/templates and act on the focused panel. This is the seam an external
loader would extend. Bundled examples: Developer Tools, GitHub Quick Nav, Social
Template. Toggle them in **Manage Plugins…** (command palette).

### Keyboard

| Shortcut | Action | | Shortcut | Action |
|---|---|---|---|---|
| `Ctrl K` | Command palette | | `Ctrl \` | Split panel right |
| `Ctrl T` | New tab | | `Ctrl Shift \` | Split panel down |
| `Ctrl W` | Close tab | | `Ctrl Shift W` | Close panel |
| `Ctrl Tab` | Next tab | | `Ctrl Shift N` | New workspace |
| `Ctrl L` | Focus address bar | | `Ctrl Alt 1/2/4` | Layout preset |
| `Ctrl R` | Reload | | `Alt ←` / `Alt →` | Back / Forward |
| `Ctrl Shift →` | Window → next display | | `Ctrl Shift ←` | Window → prev display |

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
