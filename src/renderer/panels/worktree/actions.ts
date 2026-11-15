// Worktree view commands: switching to a worktree's session, the row's 更多 menu, delete and 清理. Every removal is
// confirmed and refused whenever work could be lost (see deleteBlocker; main checks again). `--force` is offered in a
// second confirmation only for git's submodule refusal.
import type { WorktreeRemoveResult } from '@shared/git-worktrees'
import type { AgentKind, ProjectId, WorktreeId } from '@shared/types'
import { defineMessages, pick } from '@shared/i18n'
import { restoreArchivedWorktree } from '../../archive/actions'
import { openArchiveSheet } from '../../archive/store'
import { hereChoice, hereMenu } from '../../new-session/model'
import { installedAgents } from '../../new-session/sheet-store'
import { openSettings } from '../../settings/SettingsDialog'
import { useWorkspace } from '../../state/workspace'
import { disposeTerminal } from '../../terminal/registry'
import { closeWorktreeTabs } from '../terminal/actions'
import { popupMenu, type MenuAnchor } from '../../ui/menu'
import { cleanupPlan, COLLAPSED, deleteBlocker, keptText, tildePath, type WorktreeRow } from './model'
import { patchRoot, worktreesOf } from './store'

const M = defineMessages({
  zh: {
    /** Said in every delete confirmation: a plain `git worktree remove` takes ignored files with it. */
    ignoredFiles: '被 .gitignore 忽略的文件（如 .env、node_modules）也会一起删除。',
    dirty: '有未提交的改动',
    unverified: '无法确认有没有会丢的改动或提交',
    unreachable: (count: string) => `有 ${count} 个提交不在任何分支上`,
    busy: '正在变基',
    locked: '已被锁定',
    main: '主目录不能删除',
    unknown: '它已经不在 git worktree 列表里',
    submodules: '含有子模块',
    gitRefused: 'git 拒绝删除',
    cannotDelete: (name: string, reason: string) => `不能删除 ${name}：${reason}`,
    closing: (count: number) => `这里的 ${count} 个会话会一起关闭。`,
    deleteMessage: (name: string) => `删除 worktree「${name}」？`,
    deleteDetail: (folder: string, kept: string, ignored: string, closing: string) => `会删除文件夹 ${folder}，${kept}。${ignored}${closing}`,
    delete: '删除',
    submodulesMessage: (name: string) => `「${name}」含有子模块，git 不肯直接删除`,
    submodulesDetail: (ignored: string) => `已确认没有未提交的改动。强制删除会连同子模块的文件夹一起删掉。${ignored}`,
    forceDelete: '强制删除',
    deleted: (name: string) => `已删除 ${name}`,
    notDeleted: (name: string, reason: string) => `没有删除 ${name}：${reason}`,
    error: '出错了',
    skipped: (name: string, reason: string) => `${name}（${reason}）`,
    listSeparator: '；',
    nothingToCleanList: (skipped: string) => `没有可以清理的：${skipped}`,
    nothingToClean: '没有可以清理的 worktree',
    cleanMessage: (count: number) => `清理 ${count} 个 worktree？`,
    cleanDetail: (listed: string, ignored: string, skipped: string) => `${listed}\n\n文件夹会被删除，分支保留。${ignored}${skipped ? `\n跳过：${skipped}` : ''}`,
    clean: '清理',
    hasSession: '有会话',
    cleanedPartly: (removed: number, failed: string) => `已清理 ${removed} 个；没删掉：${failed}`,
    cleaned: (removed: number) => `已清理 ${removed} 个 worktree`,
    copyPath: '复制路径',
    restore: '恢复归档',
    archive: '归档…',
    deleteWorktree: '删除 worktree…',
    restoreFailed: (error: string) => `没能恢复：${error}`
  },
  en: {
    ignoredFiles: 'Files ignored by .gitignore (such as .env, node_modules) are deleted too.',
    dirty: 'Has uncommitted changes',
    unverified: "Can't tell whether changes or commits would be lost",
    unreachable: (count: string) => `${count} ${count === "1" ? "commit is" : "commits are"} not on any branch`,
    busy: 'Rebasing',
    locked: 'Locked',
    main: "The main folder can't be deleted",
    unknown: "It's no longer in the git worktree list",
    submodules: 'Contains submodules',
    gitRefused: 'git refused to delete it',
    cannotDelete: (name: string, reason: string) => `Can't delete ${name}: ${reason}`,
    closing: (count: number) => ` The ${count === 1 ? 'session' : `${count} sessions`} here will close too.`,
    deleteMessage: (name: string) => `Delete worktree "${name}"?`,
    deleteDetail: (folder: string, kept: string, ignored: string, closing: string) => `Deletes the folder ${folder}. ${kept}. ${ignored}${closing}`,
    delete: 'Delete',
    submodulesMessage: (name: string) => `"${name}" contains submodules, so git won't delete it directly`,
    submodulesDetail: (ignored: string) => `There are no uncommitted changes. Force deleting removes the submodule folders too. ${ignored}`,
    forceDelete: 'Force delete',
    deleted: (name: string) => `Deleted ${name}`,
    notDeleted: (name: string, reason: string) => `Didn't delete ${name}: ${reason}`,
    error: 'something went wrong',
    skipped: (name: string, reason: string) => `${name} (${reason})`,
    listSeparator: '; ',
    nothingToCleanList: (skipped: string) => `Nothing to clean up: ${skipped}`,
    nothingToClean: 'No worktrees to clean up',
    cleanMessage: (count: number) => `Clean up ${count} ${count === 1 ? 'worktree' : 'worktrees'}?`,
    cleanDetail: (listed: string, ignored: string, skipped: string) =>
      `${listed}\n\nThe folders are deleted; the branches stay. ${ignored}${skipped ? `\nSkipped: ${skipped}` : ''}`,
    clean: 'Clean up',
    hasSession: 'has a session',
    cleanedPartly: (removed: number, failed: string) => `Cleaned up ${removed}; not deleted: ${failed}`,
    cleaned: (removed: number) => `Cleaned up ${removed} ${removed === 1 ? 'worktree' : 'worktrees'}`,
    copyPath: 'Copy path',
    restore: 'Restore archive',
    archive: 'Archive…',
    deleteWorktree: 'Delete worktree…',
    restoreFailed: (error: string) => `Couldn't restore: ${error}`
  }
})

/**
 * Click on a row: show it expanded, and switch to its most urgent session (a worktree without one only expands).
 * Clicking the row that is already expanded collapses it.
 */
export function selectRow(root: string, row: WorktreeRow, expanded: boolean): void {
  if (expanded) {
    patchRoot(root, { picked: COLLAPSED, notice: null })
    return
  }
  patchRoot(root, { picked: row.key, notice: null })
  const state = useWorkspace.getState()
  const active = state.sessions.find((s) => s.id === state.activeSessionId)
  const target = row.sessions[0]
  if (target && !(active && row.worktreeIds.includes(active.worktreeId))) state.setActiveSession(target.id)
}

export function startSessionIn(projectId: ProjectId, row: WorktreeRow, kind: AgentKind): void {
  useWorkspace.getState().addSessionInWorktree(projectId, { path: row.openPath, branch: row.info.branch ?? '' }, kind)
}

export function removeFailureText(result: Exclude<WorktreeRemoveResult, { ok: true }>): string {
  const m = pick(M)
  switch (result.reason) {
    case 'dirty':
      return m.dirty
    case 'unverified':
      return m.unverified
    case 'unreachable-commits':
      return m.unreachable(result.message ?? '')
    case 'busy':
      return m.busy
    case 'locked':
      return m.locked
    case 'main':
      return m.main
    case 'unknown':
      return m.unknown
    case 'submodules':
      return m.submodules
    case 'git':
      return result.message ?? m.gitRefused
  }
}

/** The row's sessions as the store has them now (a dialog was open meanwhile). */
function freshRow(row: WorktreeRow): WorktreeRow {
  const ids = new Set(row.worktreeIds)
  return { ...row, sessions: useWorkspace.getState().sessions.filter((s) => ids.has(s.worktreeId)) }
}

/**
 * Ends the worktree's terminals before its folder goes, then removes it; the records go only once it is gone.
 * Also used after a local merge (F4) that was asked to remove the worktree.
 */
export async function removeWorktreeWithSessions(
  root: string,
  path: string,
  worktreeIds: readonly WorktreeId[],
  force = false
): Promise<WorktreeRemoveResult> {
  const ids = new Set(worktreeIds)
  const sessions = useWorkspace.getState().sessions.filter((s) => ids.has(s.worktreeId))
  for (const session of sessions) disposeTerminal(session.id, true)
  // The 终端 view's shells in it too.
  await closeWorktreeTabs(worktreeIds)
  const result = await window.tr.gitWorktrees.remove(root, path, force)
  const state = useWorkspace.getState()
  if (result.ok) state.forgetWorktrees([...worktreeIds])
  // Their terminals are gone either way (the confirmation said they close); the folder's record stays if it does.
  else for (const session of sessions) state.closeSession(session.id)
  return result
}

const removeOne = (root: string, row: WorktreeRow, force = false): Promise<WorktreeRemoveResult> =>
  removeWorktreeWithSessions(root, row.info.path, row.worktreeIds, force)

/** 更多 › 删除 worktree…: guard → confirm → guard again → `git worktree remove` → (submodules) second confirm → `--force`. */
export async function deleteWorktreeInteractive(root: string, row: WorktreeRow, refresh: () => Promise<void>): Promise<void> {
  const m = pick(M)
  const blocker = deleteBlocker(row)
  if (blocker) {
    patchRoot(root, { notice: m.cannotDelete(row.name, blocker) })
    return
  }
  const closing = row.sessions.length > 0 ? m.closing(row.sessions.length) : ''
  const confirmed = await window.tr.ui.confirm({
    message: m.deleteMessage(row.name),
    detail: m.deleteDetail(tildePath(row.openPath, window.tr.homeDir), keptText(row.info), m.ignoredFiles, closing),
    confirmLabel: m.delete,
    destructive: true
  })
  if (!confirmed) return
  const current = freshRow(row)
  const late = deleteBlocker(current)
  if (late) {
    patchRoot(root, { notice: m.cannotDelete(row.name, late) })
    return
  }
  patchRoot(root, { busy: true, notice: null })
  try {
    let result = await removeOne(root, current)
    if (!result.ok && result.reason === 'submodules') {
      const force = await window.tr.ui.confirm({
        message: m.submodulesMessage(row.name),
        detail: m.submodulesDetail(m.ignoredFiles),
        confirmLabel: m.forceDelete,
        destructive: true
      })
      if (force) result = await removeOne(root, current, true)
    }
    patchRoot(root, { notice: result.ok ? m.deleted(row.name) : m.notDeleted(row.name, removeFailureText(result)) })
  } catch {
    patchRoot(root, { notice: m.notDeleted(row.name, m.error) })
  } finally {
    patchRoot(root, { busy: false })
    await refresh()
  }
}

/**
 * 可清理 › 清理: one confirmation listing what goes (and what stays and why), then remove them one by one. Rows with a
 * session are never part of it (cleanupPlan), checked again after the dialog.
 */
export async function cleanUpInteractive(root: string, rows: readonly WorktreeRow[], refresh: () => Promise<void>): Promise<void> {
  const m = pick(M)
  const plan = cleanupPlan(rows)
  const skipped = plan.skip.map(({ row, reason }) => m.skipped(row.name, reason))
  if (plan.remove.length === 0) {
    patchRoot(root, { notice: skipped.length > 0 ? m.nothingToCleanList(skipped.join(m.listSeparator)) : m.nothingToClean })
    return
  }
  const listed = plan.remove.map((row) => `· ${row.name}  ${tildePath(row.openPath, window.tr.homeDir)}`).join('\n')
  const confirmed = await window.tr.ui.confirm({
    message: m.cleanMessage(plan.remove.length),
    detail: m.cleanDetail(listed, m.ignoredFiles, skipped.join(m.listSeparator)),
    confirmLabel: m.clean,
    destructive: true
  })
  if (!confirmed) return
  patchRoot(root, { busy: true, notice: null })
  const failed: string[] = []
  let removed = 0
  try {
    for (const row of plan.remove) {
      const current = freshRow(row)
      if (current.sessions.length > 0) {
        failed.push(m.skipped(row.name, m.hasSession))
        continue
      }
      const result = await removeOne(root, current).catch((): WorktreeRemoveResult => ({ ok: false, reason: 'git', message: m.error }))
      if (result.ok) removed++
      else failed.push(m.skipped(row.name, removeFailureText(result)))
    }
  } finally {
    patchRoot(root, {
      busy: false,
      notice: failed.length > 0 ? m.cleanedPartly(removed, failed.join(m.listSeparator)) : m.cleaned(removed)
    })
    await refresh()
  }
}

/** The selected row's 更多: 在此新建会话 · 复制路径 · 归档… (or 恢复归档) · 删除 worktree…. */
export async function openRowMenu(
  projectId: ProjectId,
  root: string,
  row: WorktreeRow,
  anchor: MenuAnchor,
  refresh: () => Promise<void>
): Promise<void> {
  const here = hereMenu(await installedAgents(), 'new:', row.info.prunable === null)
  const archivedId = useWorkspace.getState().worktrees.find((w) => row.worktreeIds.includes(w.id) && w.archived)?.id
  const m = pick(M)
  const choice = await popupMenu(
    [
      here,
      { type: 'item', id: 'copy-path', label: m.copyPath },
      archivedId
        ? { type: 'item', id: 'restore', label: m.restore }
        : { type: 'item', id: 'archive', label: m.archive, enabled: !row.info.isMain && row.worktreeIds.length > 0 },
      { type: 'item', id: 'delete', label: m.deleteWorktree, enabled: !row.info.isMain && !worktreesOf(root).busy }
    ],
    anchor
  )
  if (choice === 'copy-path') void navigator.clipboard.writeText(row.openPath).catch(() => {})
  else if (choice === 'archive' && row.worktreeIds[0]) openArchiveSheet(row.worktreeIds[0])
  else if (choice === 'restore' && archivedId) {
    await restoreArchivedWorktree(archivedId).catch((error: unknown) =>
      patchRoot(root, { notice: m.restoreFailed(error instanceof Error ? error.message : String(error)) })
    )
  }
  else if (choice === 'delete') await deleteWorktreeInteractive(root, row, refresh)
  else {
    const picked = hereChoice(choice, 'new:')
    if (picked && 'install' in picked) openSettings('agents', picked.install)
    else if (picked) startSessionIn(projectId, row, picked.kind)
  }
}
