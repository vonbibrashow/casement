import { useEffect, useState } from 'react'
import type { GatedPermission, PermissionPolicy, SearchEngine, SitePermission } from '@shared/types'
import { useWorkspace } from '../store/workspaceStore'
import { panelIds } from '../layout/tree'

/** Consolidated preferences. Privacy, plugins and licences keep their own
 *  screens; this links out to them rather than duplicating their UI. */
export function SettingsModal(): JSX.Element | null {
  const open = useWorkspace((s) => s.settingsOpen)
  return open ? <ModalInner /> : null
}

function ModalInner(): JSX.Element {
  const close = useWorkspace((s) => s.closeSettings)
  const settings = useWorkspace((s) => s.settings)
  const update = useWorkspace((s) => s.updateSettings)
  const openPrivacy = useWorkspace((s) => s.openPrivacy)
  const openPlugins = useWorkspace((s) => s.openPlugins)
  const openAbout = useWorkspace((s) => s.openAbout)
  const openHistory = useWorkspace((s) => s.openHistory)
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    void window.workspace.historyCount().then(setCount)
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

  const jump = (fn: () => void): void => {
    close()
    fn()
  }

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/50 pt-[6vh] backdrop-blur-sm" onPointerDown={close}>
      <div
        className="flex max-h-[86vh] w-[min(620px,94vw)] flex-col overflow-hidden rounded-xl border border-surface-border bg-surface shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">Settings</h2>
          <button onClick={close} className="rounded p-1 text-slate-500 hover:bg-surface-raised hover:text-slate-200">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {!settings ? (
          <div className="px-4 py-10 text-center text-xs text-slate-500">Loading…</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Section title="Browsing">
              <Row label="New tab page" hint="Opened when a new tab or panel is created.">
                <input
                  defaultValue={settings.newTabUrl}
                  onBlur={(e) => void update({ newTabUrl: e.target.value.trim() })}
                  spellCheck={false}
                  className="w-56 rounded-md bg-surface-sunken px-2 py-1 text-[11px] text-slate-200 outline-none ring-accent/50 focus:ring-1"
                />
              </Row>
              <Row label="Search engine" hint="Used when what you type isn't a URL.">
                <select
                  value={settings.searchEngine}
                  onChange={(e) => void update({ searchEngine: e.target.value as SearchEngine })}
                  className="w-56 rounded-md bg-surface-sunken px-2 py-1 text-[11px] text-slate-200 outline-none ring-accent/50 focus:ring-1"
                >
                  <option value="google">Google</option>
                  <option value="duckduckgo">DuckDuckGo</option>
                  <option value="bing">Bing</option>
                </select>
              </Row>
              <Row
                label="Auto-hide tabs and address bar"
                hint="Each panel collapses its chrome to a thin strip; hover the panel's top edge — or press Ctrl L — to bring it back."
              >
                <Toggle on={settings.autoHideChrome} onClick={() => void update({ autoHideChrome: !settings.autoHideChrome })} />
              </Row>
              <Row
                label="Auto-hide workspace bar"
                hint="Collapses the bar with the workspace name and status; hover the very top of the window to bring it back."
              >
                <Toggle on={settings.autoHideToolbar} onClick={() => void update({ autoHideToolbar: !settings.autoHideToolbar })} />
              </Row>
            </Section>

            <Section title="Security &amp; privacy">
              <Row
                label="Block trackers and ads"
                hint="Drops requests to known analytics, ad and pixel hosts in every panel."
              >
                <Toggle on={settings.blockTrackers} onClick={() => void update({ blockTrackers: !settings.blockTrackers })} />
              </Row>
              <Row
                label="Prefer HTTPS"
                hint="Retries plain http:// pages over https://, falling back if the site has no secure version. Local and private addresses are left alone."
              >
                <Toggle on={settings.httpsUpgrade} onClick={() => void update({ httpsUpgrade: !settings.httpsUpgrade })} />
              </Row>
              <Row label="Camera and microphone" hint="What happens when a site asks. Answers are remembered per site.">
                <PolicySelect value={settings.cameraMicPolicy} onChange={(v) => void update({ cameraMicPolicy: v })} />
              </Row>
              <Row label="Location" hint="Sites asking where you are.">
                <PolicySelect value={settings.locationPolicy} onChange={(v) => void update({ locationPolicy: v })} />
              </Row>
              <Row label="Notifications" hint="Sites asking to pop up desktop messages.">
                <PolicySelect value={settings.notificationsPolicy} onChange={(v) => void update({ notificationsPolicy: v })} />
              </Row>
              <SitePermissions />
              <p className="pb-1 pt-1 text-[11px] leading-relaxed text-slate-500">
                Access to USB, serial and HID devices is always refused, and pages cannot navigate to local files or
                launch other applications. These are browser-level protections — they are not antivirus, and the
                strongest defence remains keeping Casement updated.
              </p>
            </Section>

            <Section title="History">
              <Row label="Record browsing history" hint="Cookies and open tabs are saved regardless of this.">
                <Toggle on={settings.historyEnabled} onClick={() => void update({ historyEnabled: !settings.historyEnabled })} />
              </Row>
              <Row label="Keep history for" hint="0 keeps it until you clear it manually.">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    defaultValue={settings.historyRetentionDays}
                    onBlur={(e) => void update({ historyRetentionDays: Number(e.target.value) || 0 })}
                    className="w-20 rounded-md bg-surface-sunken px-2 py-1 text-[11px] text-slate-200 outline-none ring-accent/50 focus:ring-1"
                  />
                  <span className="text-[11px] text-slate-500">days</span>
                </div>
              </Row>
              <Row label="Saved pages" hint={count === null ? 'Counting…' : `${count} entries recorded.`}>
                <button
                  onClick={() => jump(openHistory)}
                  className="rounded-md bg-surface-raised px-2.5 py-1 text-xs text-slate-200 hover:bg-surface-border"
                >
                  View history
                </button>
              </Row>
            </Section>

            <Section title="Performance">
              <Row label="Sleep idle tabs after" hint="Background tabs unload to free memory, and reload when clicked.">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    defaultValue={settings.sleepAfterMinutes}
                    onBlur={(e) => void update({ sleepAfterMinutes: Number(e.target.value) || 1 })}
                    className="w-20 rounded-md bg-surface-sunken px-2 py-1 text-[11px] text-slate-200 outline-none ring-accent/50 focus:ring-1"
                  />
                  <span className="text-[11px] text-slate-500">minutes</span>
                </div>
              </Row>
              <Row label="Maximum loaded tabs" hint="Above this, the least recently used are put to sleep.">
                <input
                  type="number"
                  min={1}
                  defaultValue={settings.maxLiveTabs}
                  onBlur={(e) => void update({ maxLiveTabs: Number(e.target.value) || 1 })}
                  className="w-20 rounded-md bg-surface-sunken px-2 py-1 text-[11px] text-slate-200 outline-none ring-accent/50 focus:ring-1"
                />
              </Row>
            </Section>

            <Section title="More">
              <LinkRow label="Forget on exit" hint="Wipe chosen sites when you quit." onClick={() => jump(openPrivacy)} />
              <LinkRow label="Plugins" hint="Enable or disable bundled extensions." onClick={() => jump(openPlugins)} />
              <LinkRow label="About & licences" hint="Version, updates and open-source notices." onClick={() => jump(openAbout)} />
            </Section>
          </div>
        )}
      </div>
    </div>
  )
}

function PolicySelect({ value, onChange }: { value: PermissionPolicy; onChange: (v: PermissionPolicy) => void }): JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as PermissionPolicy)}
      className="w-28 rounded-md bg-surface-sunken px-2 py-1 text-[11px] text-slate-200 outline-none ring-accent/50 focus:ring-1"
    >
      <option value="ask">Ask</option>
      <option value="allow">Always allow</option>
      <option value="block">Always block</option>
    </select>
  )
}

const KIND_LABEL: Record<GatedPermission, string> = {
  'camera-mic': 'camera & mic',
  location: 'location',
  notifications: 'notifications'
}

/** Sites whose answer was remembered, so a decision can be taken back. */
function SitePermissions(): JSX.Element | null {
  const [saved, setSaved] = useState<SitePermission[]>([])
  const refresh = (): void => void window.workspace.listSitePermissions().then(setSaved)
  useEffect(refresh, [])

  if (saved.length === 0) {
    return <p className="pb-1 pt-1 text-[11px] text-slate-600">No site decisions remembered yet.</p>
  }

  return (
    <div className="pb-1 pt-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">Remembered sites ({saved.length})</span>
        <button
          onClick={() => void window.workspace.forgetAllSitePermissions().then(refresh)}
          className="ml-auto rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-red-500/20 hover:text-red-300"
        >
          Forget all
        </button>
      </div>
      <div className="max-h-32 space-y-0.5 overflow-y-auto">
        {saved.map((s) => (
          <div key={`${s.origin}:${s.kind}`} className="flex items-center gap-2 text-[11px]">
            <span className={s.granted ? 'text-emerald-400' : 'text-red-400'}>{s.granted ? 'allowed' : 'blocked'}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-slate-400">{s.origin.replace(/^https?:\/\//, '')}</span>
            <span className="shrink-0 text-slate-600">{KIND_LABEL[s.kind]}</span>
            <button
              onClick={() => void window.workspace.forgetSitePermission(s.origin, s.kind).then(refresh)}
              title="Forget, so the site is asked again"
              className="shrink-0 rounded px-1 text-slate-600 hover:bg-surface-raised hover:text-slate-300"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="border-b border-surface-border last:border-b-0">
      <div className="px-4 pt-3 text-[10px] uppercase tracking-wide text-slate-500">{title}</div>
      <div className="px-4 py-2">{children}</div>
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-start gap-4 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-slate-200">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{hint}</div>}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  )
}

function LinkRow({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }): JSX.Element {
  return (
    <button onClick={onClick} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-raised">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-slate-200">{label}</div>
        <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>
      </div>
      <span className="shrink-0 text-slate-600">›</span>
    </button>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`flex h-5 w-9 items-center rounded-full px-0.5 transition ${on ? 'bg-accent' : 'bg-surface-border'}`}
    >
      <span className={`h-4 w-4 rounded-full bg-white transition ${on ? 'translate-x-4' : ''}`} />
    </button>
  )
}
