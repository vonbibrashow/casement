import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useWorkspace } from '../store/workspaceStore'
import { useCommands, type PaletteCommand } from '../commands'
import { panelIds } from '../layout/tree'

export function CommandPalette(): JSX.Element | null {
  const open = useWorkspace((s) => s.paletteOpen)
  return open ? <PaletteInner /> : null
}

function PaletteInner(): JSX.Element {
  const close = useWorkspace((s) => s.closePalette)
  const commands = useCommands()
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => filterCommands(commands, query), [commands, query])

  useEffect(() => setSel(0), [query])

  // Native views render above the DOM, so hide them while the palette is up.
  // Also pull keyboard focus back to the chrome (a web page may have had it).
  useEffect(() => {
    void window.workspace.focusChrome()
    const ids = panelIds(useWorkspace.getState().layout)
    ids.forEach((id) => void window.workspace.setPanelVisible(id, false))
    inputRef.current?.focus()
    return () => {
      panelIds(useWorkspace.getState().layout).forEach((id) => void window.workspace.setPanelVisible(id, true))
    }
  }, [])

  const choose = (cmd?: PaletteCommand): void => {
    if (!cmd) return
    close()
    cmd.run()
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[sel])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-sm"
      onPointerDown={close}
    >
      <div
        className="w-[min(620px,92vw)] overflow-hidden rounded-xl border border-surface-border bg-surface shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command…"
          spellCheck={false}
          className="w-full border-b border-surface-border bg-transparent px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
        />
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1">
          {results.length === 0 && <div className="px-4 py-6 text-center text-xs text-slate-500">No matching commands</div>}
          {results.map((cmd, i) => (
            <button
              key={cmd.id}
              data-selected={i === sel}
              onPointerEnter={() => setSel(i)}
              onPointerDown={(e) => {
                e.stopPropagation()
                choose(cmd)
              }}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                i === sel ? 'bg-accent/20 text-white' : 'text-slate-300'
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{cmd.title}</span>
              {cmd.subtitle && <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-500">{cmd.subtitle}</span>}
              {cmd.keys && (
                <kbd className="shrink-0 rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{cmd.keys}</kbd>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Rank by best match: prefix > substring > subsequence; stable otherwise. */
function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return commands
  const scored: Array<{ cmd: PaletteCommand; score: number }> = []
  for (const cmd of commands) {
    const t = cmd.title.toLowerCase()
    let score = -1
    if (t.startsWith(q)) score = 3
    else if (t.includes(q)) score = 2
    else if (isSubsequence(q, t)) score = 1
    if (score >= 0) scored.push({ cmd, score })
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.cmd)
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0
  for (const ch of haystack) {
    if (ch === needle[i]) i++
    if (i === needle.length) return true
  }
  return needle.length === 0
}
