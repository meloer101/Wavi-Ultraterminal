import { describe, expect, it } from 'vitest'
import { SHORTCUTS } from '@shared/shortcuts'
import { FILE_SHORTCUTS } from '../panels/files/keys'
import { SHORTCUT_GROUPS, keyText } from './shortcut-list'

const keysIn = (groups: readonly string[]) =>
  SHORTCUT_GROUPS.filter((group) => groups.includes(group.id)).flatMap((group) => group.rows.flatMap((row) => row.keys))

describe('设置 · 快捷键', () => {
  // Each table is checked against the groups it belongs in, so a key that also appears elsewhere (↵, ⌘↵ in the
  // sheets and chat rows) cannot stand in for a row that was dropped.
  it('lists every app shortcut in the app groups and every file shortcut under 文件', () => {
    const app = keysIn(['sessions', 'window', 'split'])
    for (const [id, accelerator] of Object.entries(SHORTCUTS)) expect(app, id).toContain(accelerator)
    const files = keysIn(['files'])
    for (const [id, accelerator] of Object.entries(FILE_SHORTCUTS)) expect(files, id).toContain(accelerator)
  })

  it('gives every row an id of its own', () => {
    const ids = SHORTCUT_GROUPS.flatMap((group) => group.rows.map((row) => row.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('spells keys as the menus do, and a click with its modifier', () => {
    expect(keyText(SHORTCUTS['merge-worktree'], { click: '点击', space: '空格' })).toBe('⇧⌘M')
    expect(keyText('Escape', { click: '点击', space: '空格' })).toBe('esc')
    expect(keyText('click:CmdOrCtrl', { click: '点击', space: '空格' })).toBe('⌘ 点击')
    expect(keyText('Space', { click: 'click', space: 'Space' })).toBe('Space')
  })
})
