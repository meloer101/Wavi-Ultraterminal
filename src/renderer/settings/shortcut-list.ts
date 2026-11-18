// 设置 · 快捷键 (Figma 97E): every shortcut the app handles, grouped by where it works. Read-only; the keys come from
// the tables the menus and handlers use (SHORTCUTS, FILE_SHORTCUTS) where there is one, and are written out here for
// the keys a surface handles itself (terminal, browser page, sheets, chat). Pure.
import { SHORTCUTS } from '@shared/shortcuts'
import { FILE_SHORTCUTS } from '../panels/files/keys'
import { formatAccelerator } from '../ui/menu-model'

/** An Electron accelerator, `Space`, or `click:<modifier>` for a modified click. */
export type ShortcutKey = string

export interface ShortcutRow {
  id: string
  keys: readonly ShortcutKey[]
  /** The keys are the two ends of a range (⌘1 – ⌘9), not alternatives. */
  range?: boolean
}

export type ShortcutGroupId = 'sessions' | 'window' | 'split' | 'terminal' | 'browser' | 'files' | 'sheets'

export interface ShortcutGroup {
  id: ShortcutGroupId
  rows: readonly ShortcutRow[]
}

const S = SHORTCUTS

export const SHORTCUT_GROUPS = [
  {
    id: 'sessions',
    rows: [
      { id: 'new-session', keys: [S['new-session']] },
      { id: 'same-task', keys: [S['same-task']] },
      { id: 'close-session', keys: [S['close-session']] },
      { id: 'command-palette', keys: [S['command-palette']] },
      { id: 'nth', keys: ['CmdOrCtrl+1', 'CmdOrCtrl+9'], range: true },
      { id: 'next-attention', keys: [S['next-attention']] },
      { id: 'toggle-overview', keys: [S['toggle-overview']] },
      { id: 'find', keys: [S.find] },
      { id: 'merge-worktree', keys: [S['merge-worktree']] },
      { id: 'quit-all', keys: [S['quit-ending-sessions']] }
    ]
  },
  {
    id: 'window',
    rows: [
      { id: 'open-project', keys: [S['open-project']] },
      { id: 'open-project-in-window', keys: [S['open-project-in-window']] },
      { id: 'toggle-sidebar', keys: [S['toggle-sidebar']] },
      { id: 'toggle-right-panel', keys: [S['toggle-right-panel']] },
      { id: 'settings', keys: [S.settings] },
      { id: 'open-usage', keys: [S['open-usage']] },
      { id: 'open-schedules', keys: [S['open-schedules']] },
      { id: 'font-size', keys: [S['font-bigger'], S['font-smaller'], S['font-reset']] },
      { id: 'fullscreen', keys: ['Ctrl+CmdOrCtrl+F'] }
    ]
  },
  {
    id: 'split',
    rows: [
      { id: 'split-right', keys: [S['split-right']] },
      { id: 'split-down', keys: [S['split-down']] },
      { id: 'close-pane', keys: [S['close-pane']] },
      { id: 'focus-pane', keys: [S['focus-pane-left'], S['focus-pane-right'], S['focus-pane-up'], S['focus-pane-down']] }
    ]
  },
  {
    // terminal/keymap.ts, terminal/TerminalSearch.tsx, terminal/links.ts, terminal/file-input.ts
    id: 'terminal',
    rows: [
      { id: 'delete-line', keys: ['CmdOrCtrl+Backspace'] },
      { id: 'line-ends', keys: ['CmdOrCtrl+Left', 'CmdOrCtrl+Right'] },
      { id: 'word', keys: ['Alt+Left', 'Alt+Right'] },
      { id: 'find-steps', keys: ['Enter', 'Shift+Enter', 'Escape'] },
      { id: 'open-link', keys: ['click:CmdOrCtrl'] },
      { id: 'paste-file', keys: ['CmdOrCtrl+V'] }
    ]
  },
  {
    // shared/browser.ts PAGE_CHORDS, panels/browser/PortTags.tsx
    id: 'browser',
    rows: [
      { id: 'address', keys: ['CmdOrCtrl+L'] },
      { id: 'reload', keys: ['CmdOrCtrl+R', 'Shift+CmdOrCtrl+R'] },
      { id: 'history', keys: ['CmdOrCtrl+[', 'CmdOrCtrl+]'] },
      { id: 'port-outside', keys: ['click:Alt'] }
    ]
  },
  {
    id: 'files',
    rows: [
      { id: 'file-preview', keys: [FILE_SHORTCUTS.preview] },
      { id: 'file-open', keys: [FILE_SHORTCUTS.open] },
      { id: 'file-reveal', keys: [FILE_SHORTCUTS.reveal] },
      { id: 'file-insert', keys: [FILE_SHORTCUTS.insert] },
      { id: 'file-copy', keys: [FILE_SHORTCUTS.copy] }
    ]
  },
  {
    // Every sheet's footer, gui/model.ts, overview/Overview.tsx, sidebar/SessionRow.tsx
    id: 'sheets',
    rows: [
      { id: 'sheet-confirm', keys: ['CmdOrCtrl+Enter'] },
      { id: 'sheet-cancel', keys: ['Escape'] },
      { id: 'chat', keys: ['Enter', 'Shift+Enter', 'Escape'] },
      { id: 'board', keys: ['/', 'Space', 'Enter'] },
      { id: 'multi-pick', keys: ['click:CmdOrCtrl', 'click:Shift'] }
    ]
  }
] as const satisfies readonly ShortcutGroup[]

export type ShortcutRowId = (typeof SHORTCUT_GROUPS)[number]['rows'][number]['id']

/** One key as drawn: the menus' spelling (⇧⌘M, esc), a modifier and the word for click, or the word for space. */
export function keyText(key: ShortcutKey, words: { click: string; space: string }): string {
  if (key.startsWith('click:')) return `${formatAccelerator(`${key.slice('click:'.length)}+x`).slice(0, -1)} ${words.click}`
  if (key === 'Space') return words.space
  return formatAccelerator(key)
}
