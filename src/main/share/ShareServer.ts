import { createServer, type Server } from 'node:http'
import { networkInterfaces } from 'node:os'
import { timingSafeEqual } from 'node:crypto'
import { WebSocketServer } from 'ws'
import type { WebContents } from 'electron'
import type { ShareInfo } from '@shared/types'
import { ShareSession } from './ShareSession'
import { clientPage } from './clientPage'

const PORT = 7391

/** Constant-time token comparison so tokens can't be probed byte-by-byte. */
function tokenMatches(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/** Every non-internal IPv4 address, so the host can pick one their phone can reach. */
function lanAddresses(): string[] {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address)
    }
  }
  return out
}

/**
 * Hosts shared panels over HTTP + WebSocket. Starts lazily on the first share
 * and shuts down when the last one ends, so the app opens no ports until the
 * user explicitly shares something.
 */
export class ShareServer {
  private server: Server | null = null
  private wss: WebSocketServer | null = null
  private sessions = new Map<string, ShareSession>()
  private listeners = new Set<() => void>()

  /** Resolves a panel's currently active WebContents (owned by WorkspaceManager). */
  constructor(private resolveTarget: (panelId: string) => WebContents | null) {}

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    this.listeners.forEach((l) => l())
  }

  private async ensureServer(): Promise<void> {
    if (this.server) return
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
      const token = url.pathname.startsWith('/s/') ? url.pathname.slice(3) : ''
      const session = [...this.sessions.values()].find((s) => tokenMatches(s.token, token))
      if (!session) {
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('This share link is not active.')
        return
      }
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        // The guest page is fully self-contained; forbid outside resources.
        'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self' ws: wss:"
      })
      res.end(clientPage(session.token))
    })

    const wss = new WebSocketServer({ noServer: true })
    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
      const token = url.searchParams.get('token') ?? ''
      const session = [...this.sessions.values()].find((s) => tokenMatches(s.token, token))
      if (url.pathname !== '/ws' || !session) {
        socket.destroy()
        return
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        session.retarget(this.resolveTarget(session.panelId))
        session.addGuest(ws, req.socket.remoteAddress ?? 'unknown')
      })
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(PORT, '0.0.0.0', () => {
        server.off('error', reject)
        resolve()
      })
    })
    this.server = server
    this.wss = wss
  }

  private maybeStopServer(): void {
    if (this.sessions.size > 0) return
    this.wss?.close()
    this.server?.close()
    this.wss = null
    this.server = null
  }

  private info(s: ShareSession): ShareInfo {
    const urls = [`http://localhost:${PORT}/s/${s.token}`, ...lanAddresses().map((a) => `http://${a}:${PORT}/s/${s.token}`)]
    return {
      panelId: s.panelId,
      token: s.token,
      urls,
      allowControl: s.allowControl,
      clients: s.clients,
      startedAt: s.startedAt
    }
  }

  list(): ShareInfo[] {
    return [...this.sessions.values()].map((s) => this.info(s))
  }

  async start(panelId: string): Promise<ShareInfo | null> {
    const existing = this.sessions.get(panelId)
    if (existing) return this.info(existing)
    try {
      await this.ensureServer()
    } catch {
      return null // port busy — surfaced to the user as a failed share
    }
    const session = new ShareSession(panelId, () => this.emit())
    this.sessions.set(panelId, session)
    session.retarget(this.resolveTarget(panelId))
    this.emit()
    return this.info(session)
  }

  stop(panelId: string): void {
    const session = this.sessions.get(panelId)
    if (!session) return
    session.dispose()
    this.sessions.delete(panelId)
    this.maybeStopServer()
    this.emit()
  }

  setControl(panelId: string, allow: boolean): void {
    this.sessions.get(panelId)?.setAllowControl(allow)
    this.emit()
  }

  kick(panelId: string, clientId: string): void {
    this.sessions.get(panelId)?.removeGuest(clientId)
  }

  /** Re-point a live share after the panel switches tabs. */
  retarget(panelId: string): void {
    this.sessions.get(panelId)?.retarget(this.resolveTarget(panelId))
  }

  /** Tell guests the shared page navigated. */
  notifyNavigation(panelId: string): void {
    this.sessions.get(panelId)?.notifyNavigation()
  }

  isShared(panelId: string): boolean {
    return this.sessions.has(panelId)
  }

  disposeAll(): void {
    for (const s of this.sessions.values()) s.dispose()
    this.sessions.clear()
    this.maybeStopServer()
  }
}

export { PORT as SHARE_PORT }
