import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Remembers the window's size + position (and hence which monitor it was on)
// across launches — the "multi-monitor awareness" part of the spec.

const file = (): string => join(app.getPath('userData'), 'window-state.json')

export function loadWindowState(): Rectangle | null {
  try {
    const b = JSON.parse(readFileSync(file(), 'utf8')) as Rectangle
    if (typeof b.x !== 'number' || typeof b.width !== 'number') return null
    // Only restore if the saved rect still intersects an attached display,
    // otherwise the window would open off-screen after unplugging a monitor.
    const onScreen = screen.getAllDisplays().some((d) => {
      const wa = d.workArea
      return b.x < wa.x + wa.width && b.x + b.width > wa.x && b.y < wa.y + wa.height && b.y + b.height > wa.y
    })
    return onScreen ? b : null
  } catch {
    return null
  }
}

function save(bounds: Rectangle): void {
  try {
    mkdirSync(dirname(file()), { recursive: true })
    writeFileSync(file(), JSON.stringify(bounds))
  } catch {
    /* best effort */
  }
}

/** Persist the window's bounds on move/resize (debounced) and on close. */
export function trackWindowState(win: BrowserWindow): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      if (!win.isDestroyed() && !win.isMinimized()) save(win.getBounds())
    }, 400)
  }
  win.on('move', schedule)
  win.on('resize', schedule)
  win.on('close', () => {
    if (!win.isDestroyed() && !win.isMinimized()) save(win.getBounds())
  })
}

/** Move the window to the next/previous display, centered. Returns display count. */
export function moveWindowToDisplay(win: BrowserWindow, direction: 'next' | 'prev'): number {
  const displays = screen.getAllDisplays()
  if (displays.length < 2) return displays.length
  const current = screen.getDisplayMatching(win.getBounds())
  const idx = displays.findIndex((d) => d.id === current.id)
  const step = direction === 'next' ? 1 : displays.length - 1
  const target = displays[(idx + step) % displays.length]
  const wa = target.workArea
  const b = win.getBounds()
  const width = Math.min(b.width, wa.width)
  const height = Math.min(b.height, wa.height)
  win.setBounds({
    width,
    height,
    x: Math.round(wa.x + (wa.width - width) / 2),
    y: Math.round(wa.y + (wa.height - height) / 2)
  })
  return displays.length
}
