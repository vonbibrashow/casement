// One keymap, resolved in two places: the main process (`before-input-event`,
// so shortcuts fire even while a web page holds focus) and the renderer
// (`keydown`, for when the chrome holds focus). Both build a canonical combo
// string from the physical key `code` (layout-independent) and look it up here.

export type CommandId =
  | 'palette.open'
  | 'tab.new'
  | 'tab.close'
  | 'tab.next'
  | 'tab.prev'
  | 'nav.reload'
  | 'nav.back'
  | 'nav.forward'
  | 'nav.focusUrl'
  | 'panel.splitRight'
  | 'panel.splitDown'
  | 'panel.close'
  | 'workspace.new'
  | 'layout.preset1'
  | 'layout.preset2'
  | 'layout.preset4'
  | 'app.settings'
  | 'app.history'
  | 'window.nextDisplay'
  | 'window.prevDisplay'

interface Binding {
  combo: string
  command: CommandId
}

// `mod` = Ctrl (Win/Linux) or Cmd (macOS).
export const KEYMAP: Binding[] = [
  { combo: 'mod+k', command: 'palette.open' },
  { combo: 'mod+t', command: 'tab.new' },
  { combo: 'mod+w', command: 'tab.close' },
  { combo: 'mod+tab', command: 'tab.next' },
  { combo: 'mod+shift+tab', command: 'tab.prev' },
  { combo: 'mod+r', command: 'nav.reload' },
  { combo: 'alt+left', command: 'nav.back' },
  { combo: 'alt+right', command: 'nav.forward' },
  { combo: 'mod+l', command: 'nav.focusUrl' },
  { combo: 'mod+backslash', command: 'panel.splitRight' },
  { combo: 'mod+shift+backslash', command: 'panel.splitDown' },
  { combo: 'mod+shift+w', command: 'panel.close' },
  { combo: 'mod+shift+n', command: 'workspace.new' },
  { combo: 'mod+alt+1', command: 'layout.preset1' },
  { combo: 'mod+alt+2', command: 'layout.preset2' },
  { combo: 'mod+alt+4', command: 'layout.preset4' },
  { combo: 'mod+comma', command: 'app.settings' },
  { combo: 'mod+h', command: 'app.history' },
  { combo: 'mod+shift+right', command: 'window.nextDisplay' },
  { combo: 'mod+shift+left', command: 'window.prevDisplay' }
]

/** Human-readable accelerator for display (e.g. "Ctrl K"). */
export function displayCombo(command: CommandId): string {
  const combo = KEYMAP.find((b) => b.command === command)?.combo
  if (!combo) return ''
  return combo
    .split('+')
    .map((p) => {
      if (p === 'mod') return 'Ctrl'
      if (p === 'alt') return 'Alt'
      if (p === 'shift') return 'Shift'
      if (p === 'backslash') return '\\'
      if (p === 'left' || p === 'right') return p === 'left' ? '←' : '→'
      if (p === 'tab') return 'Tab'
      return p.toUpperCase()
    })
    .join(' ')
}

function normalizeCode(code: string): string {
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1].toLowerCase()
  const digit = /^Digit(\d)$/.exec(code)
  if (digit) return digit[1]
  switch (code) {
    case 'Backslash':
      return 'backslash'
    case 'Comma':
      return 'comma'
    case 'Tab':
      return 'tab'
    case 'ArrowLeft':
      return 'left'
    case 'ArrowRight':
      return 'right'
    case 'ArrowUp':
      return 'up'
    case 'ArrowDown':
      return 'down'
    case 'BracketLeft':
      return '['
    case 'BracketRight':
      return ']'
    default:
      return code.toLowerCase()
  }
}

/** Build the canonical combo string from modifier flags + physical key code. */
export function comboFromCode(mod: boolean, alt: boolean, shift: boolean, code: string): string {
  const parts: string[] = []
  if (mod) parts.push('mod')
  if (alt) parts.push('alt')
  if (shift) parts.push('shift')
  parts.push(normalizeCode(code))
  return parts.join('+')
}

export function resolveCommand(combo: string): CommandId | undefined {
  return KEYMAP.find((b) => b.combo === combo)?.command
}
