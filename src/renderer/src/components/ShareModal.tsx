import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { useWorkspace } from '../store/workspaceStore'
import { panelIds } from '../layout/tree'

export function ShareModal(): JSX.Element | null {
  const panelId = useWorkspace((s) => s.sharePanelId)
  return panelId ? <ModalInner panelId={panelId} /> : null
}

function ModalInner({ panelId }: { panelId: string }): JSX.Element {
  const close = useWorkspace((s) => s.closeShare)
  const stopShare = useWorkspace((s) => s.stopShare)
  const setShareControl = useWorkspace((s) => s.setShareControl)
  const kickClient = useWorkspace((s) => s.kickShareClient)
  const share = useWorkspace((s) => s.shares.find((x) => x.panelId === panelId))
  const panelTitle = useWorkspace((s) => {
    const p = s.panels[panelId]
    return p?.tabs.find((t) => t.id === p.activeTabId)?.title ?? 'Panel'
  })

  // Prefer a LAN URL — localhost only works on this machine.
  const urls = share?.urls ?? []
  const primary = useMemo(() => urls.find((u) => !u.includes('localhost')) ?? urls[0] ?? '', [urls])
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!primary) return
    void QRCode.toDataURL(primary, { width: 320, margin: 1, color: { dark: '#e2e8f0', light: '#00000000' } })
      .then(setQr)
      .catch(() => setQr(''))
  }, [primary])

  // Native views render above the DOM — hide them while the modal is up.
  useEffect(() => {
    void window.workspace.focusChrome()
    const ids = panelIds(useWorkspace.getState().layout)
    ids.forEach((id) => void window.workspace.setPanelVisible(id, false))
    return () => panelIds(useWorkspace.getState().layout).forEach((id) => void window.workspace.setPanelVisible(id, true))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const copy = (): void => {
    void navigator.clipboard.writeText(primary).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/50 pt-[8vh] backdrop-blur-sm" onPointerDown={close}>
      <div
        className="w-[min(620px,94vw)] overflow-hidden rounded-xl border border-surface-border bg-surface shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-100">Share this panel</h2>
            <p className="truncate text-xs text-slate-500">{panelTitle}</p>
          </div>
          <button onClick={close} className="rounded p-1 text-slate-500 hover:bg-surface-raised hover:text-slate-200">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {!share ? (
          <div className="px-4 py-8 text-center text-xs text-slate-400">
            Couldn’t start sharing — the share port may already be in use.
          </div>
        ) : (
          <>
            <div className="flex gap-4 px-4 py-4">
              <div className="flex h-[150px] w-[150px] shrink-0 items-center justify-center rounded-lg border border-surface-border bg-surface-sunken p-2">
                {qr ? <img src={qr} alt="Share link QR code" className="h-full w-full" /> : <span className="text-[10px] text-slate-600">…</span>}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <label className="text-[10px] uppercase tracking-wide text-slate-500">Link</label>
                <div className="flex gap-1.5">
                  <input
                    readOnly
                    value={primary}
                    onFocus={(e) => e.target.select()}
                    className="min-w-0 flex-1 select-text rounded-md bg-surface-sunken px-2.5 py-1.5 font-mono text-[11px] text-slate-200 outline-none"
                  />
                  <button
                    onClick={copy}
                    className="shrink-0 rounded-md bg-accent/90 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-accent"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Scan on a phone, or open the link on another computer. It works for devices on the{' '}
                  <span className="text-slate-400">same network</span> — outside that you’d need a tunnel or VPN.
                </p>

                <label className="mt-1 flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                  <button
                    role="switch"
                    aria-checked={share.allowControl}
                    onClick={() => void setShareControl(panelId, !share.allowControl)}
                    className={`flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition ${
                      share.allowControl ? 'bg-accent' : 'bg-surface-border'
                    }`}
                  >
                    <span className={`h-4 w-4 rounded-full bg-white transition ${share.allowControl ? 'translate-x-4' : ''}`} />
                  </button>
                  {share.allowControl ? 'Guests can control this panel' : 'View only'}
                </label>
              </div>
            </div>

            <div className="border-t border-surface-border px-4 py-3">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
                Connected ({share.clients.length})
              </div>
              {share.clients.length === 0 ? (
                <div className="text-xs text-slate-600">No one has joined yet.</div>
              ) : (
                <div className="space-y-1">
                  {share.clients.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span className="min-w-0 flex-1 truncate font-mono text-slate-400">{c.address}</span>
                      <button
                        onClick={() => void kickClient(panelId, c.id)}
                        className="rounded px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-red-500/20 hover:text-red-300"
                      >
                        Disconnect
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-surface-border bg-amber-500/5 px-4 py-2.5 text-[11px] leading-relaxed text-amber-200/70">
              Anyone with this link controls this panel — including any accounts already signed in inside it. Only send
              it to someone you trust, and stop sharing when you’re done.
            </div>

            <div className="flex justify-end gap-2 border-t border-surface-border px-4 py-3">
              <button onClick={close} className="rounded-md px-3 py-1.5 text-xs text-slate-400 hover:bg-surface-raised hover:text-slate-200">
                Keep sharing
              </button>
              <button
                onClick={() => {
                  void stopShare(panelId)
                  close()
                }}
                className="rounded-md bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/25"
              >
                Stop sharing
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
