import { useEffect, useMemo, useState } from 'react'
import type { LicenseManifest } from '@shared/types'
import { useWorkspace } from '../store/workspaceStore'
import { panelIds } from '../layout/tree'

/**
 * About + open-source attribution. Chromium ships under BSD-3-Clause and the
 * npm dependencies under MIT/ISC — all require their notices to accompany the
 * binary, so this screen is a distribution requirement.
 */
export function AboutModal(): JSX.Element | null {
  const open = useWorkspace((s) => s.aboutOpen)
  return open ? <ModalInner /> : null
}

function ModalInner(): JSX.Element {
  const close = useWorkspace((s) => s.closeAbout)
  const [manifest, setManifest] = useState<LicenseManifest | null>(null)
  const [version, setVersion] = useState('')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [chromiumMissing, setChromiumMissing] = useState(false)

  useEffect(() => {
    void window.workspace.getLicenses().then(setManifest)
    void window.workspace.getAppVersion().then(setVersion)
  }, [])

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

  const packages = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = manifest?.packages ?? []
    return q ? all.filter((p) => p.name.toLowerCase().includes(q) || p.license.toLowerCase().includes(q)) : all
  }, [manifest, query])

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/50 pt-[7vh] backdrop-blur-sm" onPointerDown={close}>
      <div
        className="flex max-h-[84vh] w-[min(680px,94vw)] flex-col overflow-hidden rounded-xl border border-surface-border bg-surface shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-surface-border px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-sunken">
              <div className="grid grid-cols-2 gap-[3px]">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-accent" />
                <span className="h-2.5 w-2.5 rounded-[3px] bg-surface-border" />
                <span className="h-2.5 w-2.5 rounded-[3px] bg-surface-border" />
                <span className="h-2.5 w-2.5 rounded-[3px] bg-surface-border" />
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Casement</h2>
              <p className="text-xs text-slate-500">
                Version {version || '—'}
                {manifest?.runtime.electron && ` · Electron ${manifest.runtime.electron}`}
              </p>
            </div>
          </div>
          <button onClick={close} className="rounded p-1 text-slate-500 hover:bg-surface-raised hover:text-slate-200">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Required disclaimer: this is Chromium, not Google Chrome. */}
        <div className="border-b border-surface-border px-4 py-3">
          <p className="text-[11px] leading-relaxed text-slate-400">
            {manifest?.runtime.note ??
              'This application is built on Electron, which bundles Chromium and Node.js. It is not Google Chrome and is not affiliated with or endorsed by Google.'}
          </p>
          <button
            onClick={() => void window.workspace.openChromiumLicenses().then((okay) => setChromiumMissing(!okay))}
            className="mt-2 rounded-md bg-surface-raised px-2.5 py-1.5 text-xs text-slate-200 hover:bg-surface-border"
          >
            View Chromium &amp; Electron licences
          </button>
          {chromiumMissing && (
            <span className="ml-2 text-[11px] text-amber-300/80">Not found in this build — ships with packaged releases.</span>
          )}
        </div>

        <div className="flex items-center gap-2 border-b border-surface-border px-4 py-2">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">
            Open source ({manifest?.packages.length ?? 0})
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter…"
            spellCheck={false}
            className="ml-auto w-40 rounded-md bg-surface-sunken px-2 py-1 text-[11px] text-slate-200 outline-none ring-accent/50 focus:ring-1"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!manifest ? (
            <div className="px-4 py-10 text-center text-xs text-slate-500">
              Licence manifest not found. Run <code className="text-slate-400">npm run licenses</code>.
            </div>
          ) : (
            packages.map((p) => (
              <div key={p.name} className="border-b border-surface-border/60">
                <button
                  onClick={() => setExpanded(expanded === p.name ? null : p.name)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-surface-raised/50"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-300">
                    {p.name}
                    <span className="text-slate-600"> {p.version}</span>
                  </span>
                  <span className="shrink-0 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] text-slate-400">{p.license}</span>
                  <span className="shrink-0 text-slate-600">{expanded === p.name ? '−' : '+'}</span>
                </button>
                {expanded === p.name && (
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words bg-surface-sunken px-4 py-3 font-mono text-[10px] leading-relaxed text-slate-400">
                    {p.text || 'No licence text bundled with this package.'}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
