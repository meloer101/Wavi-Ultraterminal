// What the 文件 view can do with an entry (PRD F17): the right-click menu (Figma 13D) and its shortcuts.
import { AtSign, Code, Copy, File, FolderOpen } from '../../ui/icons'
import type { SessionId } from '@shared/types'
import { defineMessages, pick } from '@shared/i18n'
import { insertIntoTerminal } from '../../session-io'
import { useWorkspace } from '../../state/workspace'
import { popupMenu, type MenuAnchor, type MenuEntry } from '../../ui/menu'
import { FILE_SHORTCUTS, isFileAction, type FileAction } from './keys'
import { setNotice, showPreview } from './store'

const M = defineMessages({
  zh: {
    insertFailed: (reason: string) => `没有插入路径：${reason}`,
    notInserted: '没有放进终端',
    preview: '预览',
    openInEditor: '用默认编辑器打开',
    reveal: '在 Finder 中显示',
    insert: '插入路径到终端',
    copy: '复制相对路径'
  },
  en: {
    insertFailed: (reason: string) => `Path not inserted: ${reason}`,
    notInserted: "Couldn't put it into the terminal",
    preview: 'Preview',
    openInEditor: 'Open in default editor',
    reveal: 'Show in Finder',
    insert: 'Insert path into terminal',
    copy: 'Copy relative path'
  }
})

export interface FileTarget {
  root: string
  path: string
  dir: boolean
  sessionId: SessionId
}

export function openInEditor(target: FileTarget): void {
  void window.tr.worktree.open(target.root, target.path).then((error) => {
    if (error) console.warn('[files] open failed:', error)
  })
}

/**
 * `@path ` in the session's input line, as if typed (PRD §6.9), then the terminal gets the keyboard. When nothing was
 * typed — a menu is open in the agent's TUI — the view says so, and the terminal still gets the keyboard for the menu.
 */
export function insertPath(target: FileTarget): void {
  setNotice(target.root, null)
  void insertIntoTerminal(target.sessionId, `@${target.path}${target.dir ? '/' : ''} `)
    .catch((error: unknown) => setNotice(target.root, pick(M).insertFailed(error instanceof Error ? error.message : pick(M).notInserted)))
    .finally(() => useWorkspace.getState().requestTerminalFocus())
}

export function runFileAction(action: FileAction, target: FileTarget): void {
  switch (action) {
    case 'preview':
      if (!target.dir) showPreview(target.root, target.path)
      break
    case 'open':
      openInEditor(target)
      break
    case 'reveal':
      window.tr.worktree.reveal(target.root, target.path)
      break
    case 'insert':
      insertPath(target)
      break
    case 'copy':
      void navigator.clipboard.writeText(target.path).catch(() => {})
      break
  }
}

export function fileMenuEntries(target: Pick<FileTarget, 'dir'>, { withPreview = true } = {}): MenuEntry[] {
  const m = pick(M)
  return [
    ...(withPreview
      ? [{ type: 'item' as const, id: 'preview', label: m.preview, icon: File, accelerator: FILE_SHORTCUTS.preview, enabled: !target.dir }]
      : []),
    { type: 'item', id: 'open', label: m.openInEditor, icon: Code, accelerator: FILE_SHORTCUTS.open },
    { type: 'item', id: 'reveal', label: m.reveal, icon: FolderOpen, accelerator: FILE_SHORTCUTS.reveal },
    { type: 'item', id: 'insert', label: m.insert, icon: AtSign, accelerator: FILE_SHORTCUTS.insert },
    { type: 'item', id: 'copy', label: m.copy, icon: Copy, accelerator: FILE_SHORTCUTS.copy }
  ]
}

export async function openFileMenu(target: FileTarget, anchor: MenuAnchor, options?: { withPreview?: boolean }): Promise<void> {
  const choice = await popupMenu(fileMenuEntries(target, options), anchor)
  if (isFileAction(choice)) runFileAction(choice, target)
}
