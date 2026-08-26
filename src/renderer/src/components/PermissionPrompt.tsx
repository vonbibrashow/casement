import { useEffect, useState } from 'react'
import type { GatedPermission, PermissionRequest } from '@shared/types'
import { useWorkspace } from '../store/workspaceStore'
import { panelIds } from '../layout/tree'

const LABELS: Record<GatedPermission, { title: string; detail: string; icon: JSX.Element }> = {
  'camera-mic': {
    title: 'use your camera and microphone',
    detail: 'It will be able to see and hear you while you stay on the site.',
    icon: (
      <>
        <rect x="3" y="6" width="11" height="9" rx="2" />
        <path d="M14 10l4-2.5v7L14 12z" strokeLinejoin="round" />
      </>
    )
  },
  location: {
    title: 'know your location',
    detail: 'It will learn roughly where you are, which can identify you.',
    icon: (
      <>
        <path d="M10 17s5.5-5 5.5-9a5.5 5.5 0 1 0-11 0c0 4 5.5 9 5.5 9z" strokeLinejoin="round" />
        <circle cx="10" cy="8" r="2" />
      </>
    )
  },
  notifications: {
    title: 'send you notifications',
    detail: 'It will be able to pop up messages even when you are not on the site.',
    icon: (
      <>
        <path d="M6 8a4 4 0 1 1 8 0c0 4 1.5 5 1.5 5h-11S6 12 6 8z" strokeLinejoin="round" />
        <path d="M8.5 16a1.75 1.75 0 0 0 3 0" strokeLinecap="round" />
      </>
    )
  }
}

/**
 * Asks before a site gets the camera, microphone or location, rather than
 * deciding globally on the user's behalf. Requests queue, so a page asking for
 * two things at once doesn't lose one.
 */
export function PermissionPrompt(): JSX.Element | null {
  const [queue, setQueue] = useState<PermissionRequest[]>([])
  const [remember, setRemember] = useState(true)

  useEffect(() => window.workspace.onPermissionRequest((req) => setQueue((q) => [...q, req])), [])

  const current = queue[0]

  // Native views paint above the DOM, so the prompt would be invisible behind
  // the page that triggered it.
  useEffect(() => {
    if (!current) return
    void window.workspace.focusChrome()
    const ids = panelIds(useWorkspace.getState().layout)
    ids.forEach((id) => void window.workspace.setPanelVisible(id, false))
    return () => panelIds(useWorkspace.getState().layout).forEach((id) => void window.workspace.setPanelVisible(id, true))
  }, [current?.id])

  if (!current) return null

  const answer = (granted: boolean): void => {
    void window.workspace.respondToPermission(current.id, granted, remember, current.origin, current.kind)
    setQueue((q) => q.slice(1))
    setRemember(true)
  }

  const meta = LABELS[current.kind]
  const host = current.origin.replace(/^https?:\/\//, '')

  return (
    <div className="absolute inset-0 z-[60] flex items-start justify-center bg-black/50 pt-[14vh] backdrop-blur-sm">
      <div className="w-[min(440px,92vw)] overflow-hidden rounded-xl border border-surface-border bg-surface shadow-2xl">
        <div className="flex gap-3 px-4 py-4">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
              {meta.icon}
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm text-slate-100">
              <span className="font-semibold break-all">{host}</span> wants to {meta.title}.
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{meta.detail}</p>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 border-t border-surface-border px-4 py-2.5 text-[11px] text-slate-400">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#6d8cff]"
          />
          Remember this for {host}
        </label>

        <div className="flex justify-end gap-2 border-t border-surface-border px-4 py-3">
          <button
            onClick={() => answer(false)}
            className="rounded-md bg-surface-raised px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-surface-border"
          >
            Block
          </button>
          <button
            onClick={() => answer(true)}
            className="rounded-md bg-accent/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent"
          >
            Allow
          </button>
        </div>

        {queue.length > 1 && (
          <div className="border-t border-surface-border px-4 py-1.5 text-[10px] text-slate-600">
            {queue.length - 1} more request{queue.length > 2 ? 's' : ''} waiting
          </div>
        )}
      </div>
    </div>
  )
}
