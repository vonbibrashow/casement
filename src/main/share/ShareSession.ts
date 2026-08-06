import { randomBytes } from 'node:crypto'
import type { WebContents } from 'electron'
import type { WebSocket } from 'ws'
import type { PendingGuest, ShareClient } from '@shared/types'

// A shared panel. Frames go out via the Chrome DevTools Protocol screencast on
// that panel's own WebContents; guest input comes back in via Input.dispatch*.
// Scope is deliberately one WebContents — a guest can drive the shared panel and
// nothing else in the app.

interface Guest {
  id: string
  socket: WebSocket
  address: string
  connectedAt: number
  /** Credential this guest presents to resume after a refresh. */
  key: string
}

interface Waiting {
  id: string
  socket: WebSocket
  address: string
  requestedAt: number
}

/** Keys that need an explicit Windows virtual key code to behave correctly. */
const VKEY: Record<string, number> = {
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  Shift: 16,
  Control: 17,
  Alt: 18,
  Escape: 27,
  ' ': 32,
  PageUp: 33,
  PageDown: 34,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Delete: 46
}

export class ShareSession {
  readonly panelId: string
  readonly token: string
  readonly startedAt = Date.now()
  allowControl = true
  /** Default on: a leaked link still can't join without the host admitting it. */
  requireApproval = true

  private guests = new Map<string, Guest>()
  private waiting = new Map<string, Waiting>()
  /**
   * Guests the host has already admitted. Approval belongs to the person, not
   * the socket, so a page refresh or a dropped connection resumes silently
   * instead of asking the host again. Cleared when the guest is disconnected
   * or the share ends.
   */
  private admittedKeys = new Set<string>()
  private target: WebContents | null = null
  private streaming = false
  /** Viewport size of the last frame — the basis for mapping guest clicks. */
  private frameSize = { w: 1280, h: 800 }

  constructor(panelId: string, private onChange: () => void) {
    this.panelId = panelId
    this.token = randomBytes(16).toString('hex')
  }

  get clients(): ShareClient[] {
    return [...this.guests.values()].map((g) => ({ id: g.id, address: g.address, connectedAt: g.connectedAt }))
  }

  /** Point the share at a WebContents (called on start and on tab switch). */
  retarget(wc: WebContents | null): void {
    if (this.target === wc) return
    this.stopStream()
    this.target = wc
    if (this.guests.size > 0) this.startStream()
    this.broadcastMeta()
  }

  private startStream(): void {
    const wc = this.target
    if (!wc || wc.isDestroyed() || this.streaming) return
    try {
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
      wc.debugger.on('message', this.onDebuggerMessage)
      void wc.debugger.sendCommand('Page.enable').catch(() => {})
      void wc.debugger
        .sendCommand('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 1600, maxHeight: 1200, everyNthFrame: 1 })
        .catch(() => {})
      this.streaming = true
    } catch {
      /* another debugger (DevTools) may be attached — sharing just won't stream */
    }
  }

  private stopStream(): void {
    const wc = this.target
    this.streaming = false
    if (!wc || wc.isDestroyed()) return
    try {
      wc.debugger.off('message', this.onDebuggerMessage)
      if (wc.debugger.isAttached()) {
        void wc.debugger.sendCommand('Page.stopScreencast').catch(() => {})
        wc.debugger.detach()
      }
    } catch {
      /* already gone */
    }
  }

  private onDebuggerMessage = (_e: unknown, method: string, params: Record<string, unknown>): void => {
    if (method !== 'Page.screencastFrame') return
    const data = params.data as string
    const sessionId = params.sessionId as number
    const meta = params.metadata as { deviceWidth?: number; deviceHeight?: number } | undefined
    if (meta?.deviceWidth && meta.deviceHeight) {
      this.frameSize = { w: meta.deviceWidth, h: meta.deviceHeight }
    }
    this.send({ type: 'frame', data })
    // Must ack or Chromium stops sending frames.
    void this.target?.debugger.sendCommand('Page.screencastFrameAck', { sessionId }).catch(() => {})
  }

  private send(msg: unknown): void {
    const payload = JSON.stringify(msg)
    for (const g of this.guests.values()) {
      if (g.socket.readyState === 1) g.socket.send(payload)
    }
  }

  private broadcastMeta(): void {
    const wc = this.target
    this.send({
      type: 'meta',
      title: wc && !wc.isDestroyed() ? wc.getTitle() : '',
      url: wc && !wc.isDestroyed() ? wc.getURL() : '',
      allowControl: this.allowControl
    })
  }

  /** Push a title/URL change out to guests. */
  notifyNavigation(): void {
    this.broadcastMeta()
  }

  setAllowControl(allow: boolean): void {
    this.allowControl = allow
    this.broadcastMeta()
  }

  get pending(): PendingGuest[] {
    return [...this.waiting.values()].map((w) => ({ id: w.id, address: w.address, requestedAt: w.requestedAt }))
  }

  /**
   * A connection arrived with a valid token. Unless approval is disabled it is
   * parked in the waiting room — no frames are sent and no input is accepted
   * until the host admits it.
   */
  addConnection(socket: WebSocket, address: string, guestKey?: string): void {
    const id = randomBytes(6).toString('hex')
    // Returning guest with a still-valid credential — resume without pestering
    // the host. Covers page refresh and reconnects after a network blip.
    if (guestKey && this.admittedKeys.has(guestKey)) {
      this.admitSocket(id, socket, address, guestKey)
      return
    }
    if (!this.requireApproval) {
      this.admitSocket(id, socket, address)
      return
    }
    this.waiting.set(id, { id, socket, address, requestedAt: Date.now() })
    socket.on('close', () => {
      this.waiting.delete(id)
      this.onChange()
    })
    socket.on('error', () => {
      this.waiting.delete(id)
      this.onChange()
    })
    try {
      socket.send(JSON.stringify({ type: 'pending' }))
    } catch {
      /* socket already gone */
    }
    this.onChange()
  }

  private admitSocket(id: string, socket: WebSocket, address: string, existingKey?: string): void {
    const key = existingKey ?? randomBytes(16).toString('hex')
    this.admittedKeys.add(key)
    this.guests.set(id, { id, socket, address, connectedAt: Date.now(), key })
    socket.on('message', (raw) => this.handleGuestMessage(String(raw)))
    socket.on('close', () => this.removeGuest(id))
    socket.on('error', () => this.removeGuest(id))
    try {
      // The guest stores this and presents it on reconnect.
      socket.send(JSON.stringify({ type: 'approved', guestKey: key }))
    } catch {
      /* socket already gone */
    }
    if (!this.streaming) this.startStream()
    this.broadcastMeta()
    this.onChange()
  }

  approve(id: string): void {
    const w = this.waiting.get(id)
    if (!w) return
    this.waiting.delete(id)
    // Drop the provisional handlers; admitSocket installs the real ones.
    w.socket.removeAllListeners('close')
    w.socket.removeAllListeners('error')
    this.admitSocket(w.id, w.socket, w.address)
  }

  deny(id: string): void {
    const w = this.waiting.get(id)
    if (!w) return
    this.waiting.delete(id)
    try {
      w.socket.send(JSON.stringify({ type: 'denied' }))
      w.socket.close()
    } catch {
      /* already closing */
    }
    this.onChange()
  }

  setRequireApproval(require: boolean): void {
    this.requireApproval = require
  }

  /** Socket went away (refresh, blip). Their credential stays valid to resume. */
  removeGuest(id: string): void {
    const g = this.guests.get(id)
    if (!g) return
    try {
      g.socket.close()
    } catch {
      /* already closing */
    }
    this.guests.delete(id)
    if (this.guests.size === 0) this.stopStream()
    this.onChange()
  }

  /**
   * Host removed this guest deliberately — revoke the credential first, or the
   * client would just reconnect straight back in.
   */
  kickGuest(id: string): void {
    const g = this.guests.get(id)
    if (!g) return
    this.admittedKeys.delete(g.key)
    try {
      g.socket.send(JSON.stringify({ type: 'denied' }))
    } catch {
      /* already closing */
    }
    this.removeGuest(id)
  }

  private handleGuestMessage(raw: string): void {
    const wc = this.target
    if (!wc || wc.isDestroyed()) return
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }

    // Navigation controls are part of "ownership" of the shared panel.
    if (msg.type === 'nav') {
      if (!this.allowControl) return
      const action = msg.action
      if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
      else if (action === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
      else if (action === 'reload') wc.reload()
      return
    }

    if (!this.allowControl) return

    const send = (method: string, params: Record<string, unknown>): void => {
      void wc.debugger.sendCommand(method, params).catch(() => {})
    }

    // Guests send normalized 0..1 coordinates, mapped here against the real
    // viewport size reported by the last screencast frame — so client-side
    // scaling (phone, rotated, zoomed) can never drift from the page.
    const px = (n: unknown): number => Math.round((typeof n === 'number' ? n : 0) * this.frameSize.w)
    const py = (n: unknown): number => Math.round((typeof n === 'number' ? n : 0) * this.frameSize.h)
    const modifiers = typeof msg.modifiers === 'number' ? msg.modifiers : 0

    switch (msg.type) {
      case 'mouse':
        send('Input.dispatchMouseEvent', {
          type: msg.action,
          x: px(msg.x),
          y: py(msg.y),
          button: msg.button ?? 'left',
          clickCount: msg.clickCount ?? 1,
          modifiers
        })
        break
      case 'wheel':
        send('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x: px(msg.x),
          y: py(msg.y),
          deltaX: msg.deltaX ?? 0,
          deltaY: msg.deltaY ?? 0,
          modifiers
        })
        break
      case 'key': {
        const key = String(msg.key ?? '')
        const isChar = key.length === 1
        send('Input.dispatchKeyEvent', {
          type: msg.action === 'up' ? 'keyUp' : 'keyDown',
          key,
          code: msg.code ?? '',
          text: msg.action === 'down' && isChar ? key : undefined,
          windowsVirtualKeyCode: VKEY[key] ?? (isChar ? key.toUpperCase().charCodeAt(0) : 0),
          modifiers
        })
        break
      }
      case 'text':
        // Mobile keyboards / IME: insert composed text directly.
        send('Input.insertText', { text: String(msg.text ?? '') })
        break
    }
  }

  /** Tear down: stop streaming and disconnect every guest. */
  dispose(): void {
    this.stopStream()
    for (const s of [...this.guests.values(), ...this.waiting.values()]) {
      try {
        s.socket.send(JSON.stringify({ type: 'ended' }))
        s.socket.close()
      } catch {
        /* ignore */
      }
    }
    this.guests.clear()
    this.waiting.clear()
    this.admittedKeys.clear() // credentials must not outlive the share
    this.target = null
  }
}
