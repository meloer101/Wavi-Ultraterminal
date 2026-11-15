// The terminal's own right-click menu away from links (Figma 26B): 复制 · 同任务多解… · 全选. 同任务多解 starts from the
// selected text, which works for every agent, hooks or not (PRD F4 v1.68).
import { defineMessages, pick } from '@shared/i18n'
import type { SessionId } from '@shared/types'
import { getSurface } from '../terminal/registry'
import { popupMenu, type MenuEntry } from '../ui/menu'
import { canRunSameTask, openSameTask } from './same-task-store'

const M = defineMessages({
  zh: { copy: '复制', sameTask: '同任务多解…', selectAll: '全选' },
  en: { copy: 'Copy', sameTask: 'Same task, several tries…', selectAll: 'Select all' }
})

export async function openTerminalMenu(sessionId: SessionId, at: { x: number; y: number }): Promise<void> {
  const surface = getSurface(sessionId)
  if (!surface) return
  const selection = surface.getSelection()
  const m = pick(M)
  const entries: MenuEntry[] = [
    { type: 'item', id: 'copy', label: m.copy, accelerator: 'CmdOrCtrl+C', enabled: selection !== '' },
    { type: 'item', id: 'same-task', label: m.sameTask, accelerator: 'Shift+CmdOrCtrl+N', enabled: canRunSameTask(sessionId) },
    { type: 'item', id: 'select-all', label: m.selectAll, accelerator: 'CmdOrCtrl+A' }
  ]
  const choice = await popupMenu(entries, at)
  if (choice === 'copy') void navigator.clipboard.writeText(selection).catch(() => {})
  else if (choice === 'same-task') openSameTask(sessionId, selection)
  else if (choice === 'select-all') surface.selectAll()
}
