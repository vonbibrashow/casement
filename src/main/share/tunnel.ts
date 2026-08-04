import { spawn, type ChildProcess } from 'node:child_process'
import type { TunnelState } from '@shared/types'

// Optional public-internet exposure for shares, via a `cloudflared` quick
// tunnel. Deliberately opt-in and off by default: LAN sharing needs no third
// party, while a tunnel hands a public hostname to Cloudflare. Nothing is
// installed automatically — if the binary is absent we say so and stay off.

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i

export class Tunnel {
  private proc: ChildProcess | null = null
  state: TunnelState = 'off'
  url: string | null = null
  message: string | null = null

  constructor(private onChange: () => void) {}

  private set(state: TunnelState, message: string | null = null): void {
    this.state = state
    this.message = message
    this.onChange()
  }

  /** Start a quick tunnel to the local share port. Resolves once it's up or failed. */
  async start(port: number): Promise<void> {
    if (this.proc) return
    this.set('starting')

    let child: ChildProcess
    try {
      child = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      })
    } catch {
      this.set('unavailable', 'cloudflared is not installed')
      return
    }
    this.proc = child

    child.on('error', (err: NodeJS.ErrnoException) => {
      this.proc = null
      this.url = null
      this.set(err.code === 'ENOENT' ? 'unavailable' : 'error', err.code === 'ENOENT' ? 'cloudflared is not installed' : err.message)
    })
    child.on('exit', () => {
      this.proc = null
      this.url = null
      if (this.state !== 'unavailable') this.set('off')
    })

    // cloudflared prints the assigned hostname on stderr.
    const scan = (buf: Buffer): void => {
      const m = URL_RE.exec(buf.toString())
      if (m && !this.url) {
        this.url = m[0]
        this.set('on')
      }
    }
    child.stderr?.on('data', scan)
    child.stdout?.on('data', scan)

    // Give it a window to report a hostname before declaring failure.
    await new Promise<void>((resolve) => {
      const started = Date.now()
      const tick = setInterval(() => {
        if (this.url || this.state === 'unavailable' || this.state === 'error' || Date.now() - started > 20_000) {
          clearInterval(tick)
          if (!this.url && this.state === 'starting') this.set('error', 'Tunnel did not start in time')
          resolve()
        }
      }, 250)
    })
  }

  stop(): void {
    const child = this.proc
    this.proc = null
    this.url = null
    if (child) {
      try {
        child.kill()
      } catch {
        /* already dead */
      }
    }
    this.set('off')
  }
}
