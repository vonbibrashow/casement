import { app, type BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import type { GatedPermission, PermissionRequest, SitePermission } from '@shared/types'
import { IPC } from '@shared/ipc'
import { getSettings } from '../settings'

// Per-site permission decisions, and the prompt that produces them.
//
// A global on/off switch is a blunt instrument: it forces a choice between
// never using video calls and letting every site reach the camera. Sites are
// asked about individually instead, and the answer is remembered per origin.

const filePath = (): string => join(app.getPath('userData'), 'site-permissions.json')

let decisions: SitePermission[] | null = null

function load(): SitePermission[] {
  if (decisions) return decisions
  try {
    const parsed = JSON.parse(readFileSync(filePath(), 'utf8')) as SitePermission[]
    decisions = Array.isArray(parsed) ? parsed : []
  } catch {
    decisions = []
  }
  return decisions
}

function persist(): void {
  try {
    const target = filePath()
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, JSON.stringify(load(), null, 2), 'utf8')
  } catch {
    /* best effort */
  }
}

export function listSitePermissions(): SitePermission[] {
  return [...load()].sort((a, b) => a.origin.localeCompare(b.origin))
}

export function forgetSitePermission(origin: string, kind: GatedPermission): void {
  decisions = load().filter((d) => !(d.origin === origin && d.kind === kind))
  persist()
}

export function forgetAllSitePermissions(): void {
  decisions = []
  persist()
}

function remember(origin: string, kind: GatedPermission, granted: boolean): void {
  const list = load().filter((d) => !(d.origin === origin && d.kind === kind))
  list.push({ origin, kind, granted, decidedAt: Date.now() })
  decisions = list
  persist()
}

function policyFor(kind: GatedPermission): string {
  const s = getSettings()
  if (kind === 'camera-mic') return s.cameraMicPolicy
  if (kind === 'location') return s.locationPolicy
  return s.notificationsPolicy
}

/** Origin of a URL, or '' when it isn't a real web origin worth remembering. */
export function originOf(url: string): string {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : ''
  } catch {
    return ''
  }
}

// --- prompting ---------------------------------------------------------------

interface Pending {
  resolve: (granted: boolean) => void
  timer: ReturnType<typeof setTimeout>
}

const pending = new Map<string, Pending>()
let promptWindow: BrowserWindow | null = null

/** The window that renders prompts; without one every request is refused. */
export function setPromptWindow(win: BrowserWindow): void {
  promptWindow = win
}

/** Resolve a prompt from the renderer. */
export function resolvePermission(id: string, granted: boolean, rememberChoice: boolean, origin: string, kind: GatedPermission): void {
  const p = pending.get(id)
  if (!p) return
  pending.delete(id)
  clearTimeout(p.timer)
  if (rememberChoice && origin) remember(origin, kind, granted)
  p.resolve(granted)
}

/** Deny everything still outstanding — used when the window goes away. */
export function cancelAllPermissionPrompts(): void {
  for (const [id, p] of pending) {
    clearTimeout(p.timer)
    p.resolve(false)
    pending.delete(id)
  }
}

/**
 * Decide a request: a remembered answer wins, then the configured policy, and
 * only `ask` reaches the user. Anything unresolved is denied — failing closed
 * matters more here than convenience.
 */
export async function decide(url: string, kind: GatedPermission): Promise<boolean> {
  const origin = originOf(url)
  if (origin) {
    const saved = load().find((d) => d.origin === origin && d.kind === kind)
    if (saved) return saved.granted
  }

  const policy = policyFor(kind)
  if (policy === 'allow') return true
  if (policy === 'block') return false

  // `ask` — but with nowhere to ask, refuse.
  if (!origin || !promptWindow || promptWindow.isDestroyed()) return false

  const id = randomBytes(8).toString('hex')
  const request: PermissionRequest = { id, origin, kind }
  return new Promise<boolean>((resolve) => {
    // A prompt the user never answers must not pin the callback forever.
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve(false)
    }, 120_000)
    pending.set(id, { resolve, timer })
    promptWindow?.webContents.send(IPC.permissionRequest, request)
  })
}

/** Synchronous checks can't prompt, so they only report settled answers. */
export function decideSync(url: string, kind: GatedPermission): boolean {
  const origin = originOf(url)
  if (origin) {
    const saved = load().find((d) => d.origin === origin && d.kind === kind)
    if (saved) return saved.granted
  }
  return policyFor(kind) === 'allow'
}
