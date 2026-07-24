import type { LayoutNode, PanelState, TabState, WorkspaceDoc } from '@shared/types'
import { buildBalanced, newPanelId, newTabId } from './layout/tree'

/** A panel in a template: an ordered set of tab URLs (first is active). */
interface TemplatePanel {
  urls: string[]
}

export interface WorkspaceTemplate {
  id: string
  name: string
  icon: string
  panels: TemplatePanel[]
}

// Predefined workspaces (spec Feature 8). Each opens as a grid of panels; only
// the first tab of each panel loads — the rest start asleep to keep it light.
export const TEMPLATES: WorkspaceTemplate[] = [
  {
    id: 'developer',
    name: 'Developer',
    icon: '💻',
    panels: [
      { urls: ['https://github.com'] },
      { urls: ['https://vercel.com/dashboard', 'https://supabase.com/dashboard'] },
      { urls: ['https://chat.openai.com', 'https://claude.ai'] },
      { urls: ['https://developer.mozilla.org'] }
    ]
  },
  {
    id: 'research',
    name: 'Research',
    icon: '🔬',
    panels: [
      { urls: ['https://www.google.com'] },
      { urls: ['https://scholar.google.com'] },
      { urls: ['https://en.wikipedia.org'] },
      { urls: ['https://www.notion.so'] }
    ]
  },
  {
    id: 'trading',
    name: 'Trading',
    icon: '📈',
    panels: [
      { urls: ['https://www.tradingview.com/chart'] },
      { urls: ['https://dexscreener.com'] },
      { urls: ['https://web.telegram.org'] },
      { urls: ['https://www.coingecko.com'] }
    ]
  },
  {
    id: 'personal',
    name: 'Personal',
    icon: '🌐',
    panels: [{ urls: ['https://mail.google.com'] }, { urls: ['https://calendar.google.com'] }]
  }
]

/** Materialize a template into a fresh workspace body (new panel/tab ids). */
export function buildTemplateBody(template: WorkspaceTemplate): Pick<WorkspaceDoc, 'layout' | 'panels' | 'focusedPanelId'> {
  const panels: Record<string, PanelState> = {}
  const ids: string[] = []
  for (const spec of template.panels) {
    const pid = newPanelId()
    ids.push(pid)
    const tabs: TabState[] = spec.urls.map((url, i) => ({
      id: newTabId(),
      url,
      title: 'New Tab',
      canGoBack: false,
      canGoForward: false,
      isLoading: false,
      status: i === 0 ? 'live' : 'sleeping'
    }))
    panels[pid] = { id: pid, tabs, activeTabId: tabs[0].id }
  }
  const layout: LayoutNode = buildBalanced(ids)
  return { layout, panels, focusedPanelId: ids[0] }
}
