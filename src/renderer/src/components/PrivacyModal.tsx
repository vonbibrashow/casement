import { useEffect, useState } from 'react'
import type { CleanupReport, PrivacyPreview, PrivacyRules } from '@shared/types'
import { useWorkspace } from '../store/workspaceStore'
import { panelIds } from '../layout/tree'

export function PrivacyModal(): JSX.Element | null {
  const open = useWorkspace((s) => s.privacyOpen)
  return open ? <ModalInner /> : null
}

function ModalInner(): JSX.Element {
  const close = useWorkspace((s) => s.closePrivacy)
  const [rules, setRules] = useState<PrivacyRules | null>(null)
  const [preview, setPreview] = useState<PrivacyPreview | null>(null)
  const [report, setReport] = useState<CleanupReport | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.workspace.getPrivacyRules().then(setRules)
  }, [])

  // Re-run the dry run whenever the rules change, so the effect is always visible.
  useEffect(() => {
    if (!rules) return
    void window.workspace.previewPrivacy(rules).then(setPreview)
  }, [rules])

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

  const patch = (next: Partial<PrivacyRules>): void => {
    if (!rules) return
    const merged = { ...rules, ...next }
    setRules(merged)
    void window.workspace.setPrivacyRules(merged)
  }

  const clearNow = (): void => {
    if (!rules) return
    setBusy(true)
    void window.workspace
      .clearNow(rules)
      .then(setReport)
      .finally(() => setBusy(false))
  }

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/50 pt-[7vh] backdrop-blur-sm" onPointerDown={close}>
      <div
        className="flex max-h-[84vh] w-[min(640px,94vw)] flex-col overflow-hidden rounded-xl border border-surface-border bg-surface shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Forget on exit</h2>
            <p className="text-xs text-slate-500">Wipe chosen sites when you quit — keep everything else signed in.</p>
          </div>
          <button onClick={close} className="rounded p-1 text-slate-500 hover:bg-surface-raised hover:text-slate-200">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {!rules ? (
          <div className="px-4 py-10 text-center text-xs text-slate-500">Loading…</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-3 px-4 py-4">
              <Toggle on={rules.enabled} onClick={() => patch({ enabled: !rules.enabled })} label="Clear matching sites when I quit" strong />
              <Toggle
                on={rules.clearAdult}
                onClick={() => patch({ clearAdult: !rules.clearAdult })}
                label="Adult sites (built-in list)"
                hint="Matches hostnames containing porn, xxx, hentai, cam sites and similar."
              />
              <Toggle
                on={rules.clearHistory}
                onClick={() => patch({ clearHistory: !rules.clearHistory })}
                label="Also remove them from saved history"
                hint="Otherwise only cookies and site storage are cleared."
              />
            </div>

            <DomainList
              title="Also forget these sites"
              hint="One domain per line. Subdomains included."
              value={rules.forgetDomains}
              onChange={(forgetDomains) => patch({ forgetDomains })}
              placeholder={'example.com\nanother-site.net'}
            />

            <DomainList
              title="Never clear these"
              hint="Protected even if a rule above matches — your banking and shopping logins."
              value={rules.keepDomains}
              onChange={(keepDomains) => patch({ keepDomains })}
              placeholder={'mybank.com\npaypal.com'}
              accent
            />

            {/* Dry run so nothing is a surprise. */}
            {preview && (
              <div className="border-t border-surface-border px-4 py-3">
                <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
                  From your saved history — what these rules do
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1 text-[11px] text-red-300">Will be forgotten ({preview.forget.length})</div>
                    <div className="max-h-28 space-y-0.5 overflow-y-auto text-[11px] text-slate-400">
                      {preview.forget.length === 0 ? (
                        <span className="text-slate-600">Nothing matches.</span>
                      ) : (
                        preview.forget.map((h) => <div key={h} className="truncate font-mono">{h}</div>)
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] text-emerald-300">Kept ({preview.keep.length})</div>
                    <div className="max-h-28 space-y-0.5 overflow-y-auto text-[11px] text-slate-400">
                      {preview.keep.length === 0 ? (
                        <span className="text-slate-600">—</span>
                      ) : (
                        preview.keep.map((h) => <div key={h} className="truncate font-mono">{h}</div>)
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {report && (
              <div className="mx-4 mb-3 rounded-md bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200/80">
                Cleared {report.cookiesRemoved} cookie{report.cookiesRemoved === 1 ? '' : 's'} and {report.tabsRemoved} history
                entr{report.tabsRemoved === 1 ? 'y' : 'ies'}
                {report.hosts.length > 0 && ` across ${report.hosts.length} site${report.hosts.length === 1 ? '' : 's'}`}.
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-surface-border px-4 py-3">
          <span className="text-[11px] text-slate-500">Rules apply to every workspace.</span>
          <div className="flex gap-2">
            <button
              onClick={clearNow}
              disabled={busy || !rules}
              className="rounded-md bg-surface-raised px-3 py-1.5 text-xs text-slate-200 hover:bg-surface-border disabled:opacity-40"
            >
              {busy ? 'Clearing…' : 'Clear now'}
            </button>
            <button onClick={close} className="rounded-md bg-accent/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Toggle({
  on,
  onClick,
  label,
  hint,
  strong
}: {
  on: boolean
  onClick: () => void
  label: string
  hint?: string
  strong?: boolean
}): JSX.Element {
  return (
    <div className="flex items-start gap-2.5">
      <button
        role="switch"
        aria-checked={on}
        onClick={onClick}
        className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition ${on ? 'bg-accent' : 'bg-surface-border'}`}
      >
        <span className={`h-4 w-4 rounded-full bg-white transition ${on ? 'translate-x-4' : ''}`} />
      </button>
      <div className="min-w-0">
        <div className={`text-xs ${strong ? 'font-medium text-slate-100' : 'text-slate-300'}`}>{label}</div>
        {hint && <div className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{hint}</div>}
      </div>
    </div>
  )
}

function DomainList({
  title,
  hint,
  value,
  onChange,
  placeholder,
  accent
}: {
  title: string
  hint: string
  value: string[]
  onChange: (v: string[]) => void
  placeholder: string
  accent?: boolean
}): JSX.Element {
  const [text, setText] = useState(value.join('\n'))
  useEffect(() => setText(value.join('\n')), [value])

  const commit = (): void => {
    const list = text
      .split('\n')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    onChange([...new Set(list)])
  }

  return (
    <div className="border-t border-surface-border px-4 py-3">
      <div className={`text-xs ${accent ? 'text-emerald-300' : 'text-slate-200'}`}>{title}</div>
      <div className="mb-1.5 mt-0.5 text-[11px] leading-relaxed text-slate-500">{hint}</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        rows={3}
        spellCheck={false}
        placeholder={placeholder}
        className="w-full select-text resize-y rounded-md bg-surface-sunken px-2.5 py-1.5 font-mono text-[11px] text-slate-200 outline-none ring-accent/50 placeholder:text-slate-600 focus:ring-1"
      />
    </div>
  )
}
