import { useEffect, useState } from 'react'
import { useWorkspace } from '../store/workspaceStore'
import { panelIds } from '../layout/tree'
import { pluginHost } from '../plugins/host'

export function PluginsModal(): JSX.Element | null {
  const open = useWorkspace((s) => s.pluginsOpen)
  return open ? <ModalInner /> : null
}

function ModalInner(): JSX.Element {
  const close = useWorkspace((s) => s.closePlugins)
  const [plugins, setPlugins] = useState(() => pluginHost.list())

  useEffect(() => pluginHost.subscribe(() => setPlugins(pluginHost.list())), [])

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

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/50 pt-[10vh] backdrop-blur-sm" onPointerDown={close}>
      <div
        className="w-[min(560px,92vw)] overflow-hidden rounded-xl border border-surface-border bg-surface shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">Plugins</h2>
          <button onClick={close} className="rounded p-1 text-slate-500 hover:bg-surface-raised hover:text-slate-200">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="max-h-[60vh] divide-y divide-surface-border overflow-y-auto">
          {plugins.map((p) => (
            <div key={p.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-slate-100">{p.name}</div>
                <div className="mt-0.5 text-xs text-slate-500">{p.description}</div>
              </div>
              <button
                role="switch"
                aria-checked={p.enabled}
                onClick={() => pluginHost.setEnabled(p.id, !p.enabled)}
                className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition ${
                  p.enabled ? 'bg-accent' : 'bg-surface-border'
                }`}
              >
                <span className={`h-4 w-4 rounded-full bg-white transition ${p.enabled ? 'translate-x-4' : ''}`} />
              </button>
            </div>
          ))}
        </div>
        <div className="border-t border-surface-border px-4 py-2 text-[11px] text-slate-500">
          Enabled plugins contribute commands and templates to the command palette (Ctrl K).
        </div>
      </div>
    </div>
  )
}
