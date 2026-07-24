import { useEffect } from 'react'
import { useWorkspace } from './store/workspaceStore'
import { Toolbar } from './components/Toolbar'
import { WorkspaceView } from './components/WorkspaceView'
import { WorkspaceRail } from './components/WorkspaceRail'

// Guard against React StrictMode's double-invoked effects seeding two workspaces.
let bootstrapped = false

export function App(): JSX.Element {
  const ready = useWorkspace((s) => s.ready)
  const init = useWorkspace((s) => s.init)

  useEffect(() => {
    if (bootstrapped) return
    bootstrapped = true
    void init()
  }, [init])

  return (
    <div className="flex h-full w-full bg-surface-sunken">
      {ready && <WorkspaceRail />}
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar />
        <div className="relative flex-1 overflow-hidden">
          {ready ? (
            <WorkspaceView />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Restoring workspace…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
