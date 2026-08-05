import { createServer, type Server } from 'node:http'
import { networkInterfaces } from 'node:os'
import { timingSafeEqual } from 'node:crypto'
import { WebSocketServer } from 'ws'
import type { WebContents } from 'electron'
import type { ShareEndpoint, ShareInfo } from '@shared/types'
import { ShareSession } from './ShareSession'
import { clientPage } from './clientPage'
import { Tunnel } from './tunnel'

// Preferred port, with a small fallback range so a second instance (or any
// unrelated process squatting the port) doesn't make sharing fail outright.
const PORT = 7391
const PORT_ATTEMPTS = 8

/** Constant-time token comparison so tokens can't be probed byte-by-byte. */
function tokenMatches(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

const isPrivateLan = (ip: string): boolean =>
  /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)

/** 100.64.0.0/10 — carrier-grade NAT, used by Tailscale and similar VPNs. */
const isVpnRange = (ip: string): boolean => {
  const m = /^100\.(\d+)\./.exec(ip)
  return !!m && Number(m[1]) >= 64 && Number(m[1]) <= 127
}

/**
 * Candidate addresses a guest could actually dial, best first.
 *
 * A machine typically has several IPv4 addresses and most are useless here:
 * 169.254.x.x is link-local (an adapter that never got a DHCP lease) and is
 * unreachable from any other device, which shows up as "loads, then times out".
 * Those are dropped; real LAN addresses rank above VPN ones.
 */
function candidateAddresses(): Array<{ address: string; label: string; kind: 'lan' | 'vpn' | 'other' }> {
  const out: Array<{ address: string; label: string; kind: 'lan' | 'vpn' | 'other' }> = []
  for (const [label, list] of Object.entries(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family !== 'IPv4' || ni.internal) continue
      if (ni.address.startsWith('169.254.')) continue // link-local: never reachable
      const kind = isPrivateLan(ni.address) ? 'lan' : isVpnRange(ni.address) ? 'vpn' : 'other'
      out.push({ address: ni.address, label, kind })
    }
  }
  const rank = { lan: 0, vpn: 1, other: 2 } as const
  return out.sort((a, b) => rank[a.kind] - rank[b.kind])
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
  private tunnel = new Tunnel(() => this.emit())
  /** Port actually bound (may differ from PORT if it was taken). */
  private port = PORT

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
        session.addConnection(ws, req.socket.remoteAddress ?? 'unknown')
      })
    })

    // Walk the fallback range until one binds.
    let bound = -1
    for (let i = 0; i < PORT_ATTEMPTS; i++) {
      const candidate = PORT + i
      const okPort = await new Promise<boolean>((resolve) => {
        const onError = (): void => resolve(false)
        server.once('error', onError)
        server.listen(candidate, '0.0.0.0', () => {
          server.off('error', onError)
          resolve(true)
        })
      })
      if (okPort) {
        bound = candidate
        break
      }
    }
    if (bound === -1) throw new Error('No free port for sharing')

    this.port = bound
    this.server = server
    this.wss = wss
  }

  private maybeStopServer(): void {
    if (this.sessions.size > 0) return
    // Nothing is shared any more — tear the public tunnel down with the server.
    this.tunnel.stop()
    this.wss?.close()
    this.server?.close()
    this.wss = null
    this.server = null
  }

  private info(s: ShareSession): ShareInfo {
    const path = `/s/${s.token}`
    const endpoints: ShareEndpoint[] = []
    if (this.tunnel.url) {
      endpoints.push({ url: `${this.tunnel.url}${path}`, label: 'Tunnel', kind: 'public', hint: 'Reachable from anywhere' })
    }
    for (const a of candidateAddresses()) {
      endpoints.push({
        url: `http://${a.address}:${this.port}${path}`,
        label: a.label,
        kind: a.kind,
        hint:
          a.kind === 'lan'
            ? 'Devices on the same network'
            : a.kind === 'vpn'
              ? 'Devices on your VPN, anywhere'
              : 'May not be reachable'
      })
    }
    endpoints.push({
      url: `http://localhost:${this.port}${path}`,
      label: 'This machine',
      kind: 'local',
      hint: 'Only this computer'
    })
    return {
      panelId: s.panelId,
      token: s.token,
      endpoints,
      publicUrl: this.tunnel.url ? `${this.tunnel.url}/s/${s.token}` : null,
      tunnelState: this.tunnel.state,
      tunnelMessage: this.tunnel.message,
      allowControl: s.allowControl,
      requireApproval: s.requireApproval,
      clients: s.clients,
      pending: s.pending,
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

  approve(panelId: string, requestId: string): void {
    this.sessions.get(panelId)?.approve(requestId)
  }

  deny(panelId: string, requestId: string): void {
    this.sessions.get(panelId)?.deny(requestId)
  }

  setRequireApproval(panelId: string, require: boolean): void {
    this.sessions.get(panelId)?.setRequireApproval(require)
    this.emit()
  }

  /** Expose shares to the internet through a cloudflared quick tunnel. */
  async startTunnel(): Promise<void> {
    if (!this.server) return // nothing shared yet, so nothing to expose
    await this.tunnel.start(this.port)
  }

  stopTunnel(): void {
    this.tunnel.stop()
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
    this.tunnel.stop()
    for (const s of this.sessions.values()) s.dispose()
    this.sessions.clear()
    this.maybeStopServer()
  }
}

export { PORT as SHARE_PORT }
