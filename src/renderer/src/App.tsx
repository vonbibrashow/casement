import { useEffect } from 'react'
import { comboFromCode, resolveCommand, type CommandId } from '@shared/keymap'
import { useWorkspace } from './store/workspaceStore'
import { runCommand } from './commands'
import { Toolbar } from './components/Toolbar'
import { WorkspaceView } from './components/WorkspaceView'
import { WorkspaceRail } from './components/WorkspaceRail'
import { CommandPalette } from './components/CommandPalette'
import { PanelDragLayer } from './components/PanelDragLayer'

// Guard against React StrictMode's double-invoked effects seeding two workspaces.
let bootstrapped = false

export function App(): JSX.Element {
  const ready = useWorkspace((s) => s.ready)
  const init = useWorkspace((s) => s.init)
  const setFocusedPanel = useWorkspace((s) => s.setFocusedPanel)

  useEffect(() => {
    if (bootstrapped) return
    bootstrapped = true
    void init()
  }, [init])

  // Keyboard shortcuts. Fires here when the chrome has focus; the main process
  // forwards shortcuts that fire while a web page has focus (onShortcut).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod && !e.altKey) return
      const command = resolveCommand(comboFromCode(mod, e.altKey, e.shiftKey, e.code))
      if (command) {
        e.preventDefault()
        runCommand(command)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    const offShortcut = window.workspace.onShortcut((command: CommandId, panelId: string) => runCommand(command, panelId))
    const offFocus = window.workspace.onPanelFocused((panelId: string) => setFocusedPanel(panelId))
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      offShortcut()
      offFocus()
    }
  }, [setFocusedPanel])

  return (
    <div className="flex h-full w-full bg-surface-sunken">
      {ready && <WorkspaceRail />}
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar />
        <div className="relative flex-1 overflow-hidden">
          {ready ? (
            <WorkspaceView />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">Restoring workspace…</div>
          )}
          <CommandPalette />
        </div>
      </div>
      <PanelDragLayer />
    </div>
  )
}
