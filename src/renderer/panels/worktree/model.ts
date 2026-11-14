// Worktree view (PRD F17, Figma 13C / 85B″): the project's git worktrees joined with the workspace's sessions, grouped
// into the working list, 可清理 (bulk) and 没有会话 (one by one), plus the delete guard. Pure; WorktreeView renders it.
import type { GitWorktreeInfo, GitWorktreeListing } from '@shared/git-worktrees'
import { isActiveStatus } from '@shared/lifecycle'
import { compareByUrgency } from '@shared/session-status'
import type { AgentKind, Session, SessionStatus, Worktree, WorktreeId } from '@shared/types'

export interface WorktreeRow {
  /** Resolved path: stable identity across refreshes. */
  key: string
  info: GitWorktreeInfo
  /** Branch (the one being rebased, during a rebase), or the short commit when detached. */
  name: string
  /** Sessions in this worktree, most urgent first. */
  sessions: Session[]
  /** Status of the most urgent session; null when the worktree has none. */
  status: SessionStatus | null
  /** The workspace's records for this folder. */
  worktreeIds: WorktreeId[]
  /** Path new sessions should use: the workspace's spelling when known, else git's. */
  openPath: string
  /** What the row is called: the most urgent session's title, else the branch (Figma 85B″). */
  title: string
  /** Shown after the title, quieter: the branch and what is odd about the checkout; '' when the title already is it. */
  where: string
  /** Agent of the most urgent session, drawn before `where`; null without a session. */
  agent: AgentKind | null
  /** `+N −M` uncommitted, '' when clean, '?' when git could not tell. */
  diff: string
  /** `↑N` commits of its own, 已合并 once they are all in the base (not in 可清理, which says it), '' otherwise. */
  ahead: string
}

export interface WorktreeGroups {
  /** The main checkout and every worktree that has a session. */
  working: WorktreeRow[]
  /** No session, and merged into the base or the folder is gone: 清理 removes these in one go. */
  cleanable: WorktreeRow[]
  /** No session, not merged: deleted one by one from 更多, never in bulk (could be hand-made or unfinished work). */
  idle: WorktreeRow[]
}

export function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : '无提交'
}

/** `/Users/me/x` → `~/x`. */
export function tildePath(path: string, home: string): string {
  const h = home.replace(/\/+$/, '')
  if (!h) return path
  if (path === h) return '~'
  return path.startsWith(`${h}/`) ? `~${path.slice(h.length)}` : path
}

export function formatDiff(info: Pick<GitWorktreeInfo, 'added' | 'removed' | 'dirtyCount'>): string {
  if (info.dirtyCount === null) return '?'
  return info.dirtyCount > 0 || info.added > 0 || info.removed > 0 ? `+${info.added} −${info.removed}` : ''
}

/** Commits of its own: `↑N`; 已合并 once they are all in the base; nothing at 0 or without a base. Behind is left out. */
export function formatAhead(info: Pick<GitWorktreeInfo, 'ahead' | 'merged' | 'base'>): string {
  if (info.merged && info.base) return '已合并'
  return info.ahead ? `↑${info.ahead}` : ''
}

/** What is odd about the checkout, said after its branch: main, a rebase, a detached HEAD, a lock, a missing folder. */
function checkoutNotes(info: GitWorktreeInfo): string[] {
  const notes: string[] = []
  if (info.isMain) notes.push('主目录')
  if (info.rebasing) notes.push('变基中')
  else if (info.branch === null) notes.push(info.unreachableCommits ? `分离的 HEAD · ${info.unreachableCommits} 个提交不在分支上` : '分离的 HEAD')
  if (info.locked) notes.push('已锁定')
  if (info.prunable !== null) notes.push('文件夹已不在')
  return notes
}

/** Title and the quieter text after it (Figma 85B″): a session's title is followed by the branch; else the branch leads. */
export function rowLabels(name: string, sessions: readonly Session[], info: GitWorktreeInfo): { title: string; where: string } {
  const notes = checkoutNotes(info)
  const top = sessions[0]
  if (top) return { title: top.title, where: [name, ...notes].join(' · ') }
  return { title: name, where: notes.join(' · ') }
}

/** Which group a worktree goes in. Any session keeps it in the working list. */
export function groupOf(info: Pick<GitWorktreeInfo, 'isMain' | 'merged' | 'prunable'>, sessionCount: number): keyof WorktreeGroups {
  if (info.isMain || sessionCount > 0) return 'working'
  return info.merged || info.prunable !== null ? 'cleanable' : 'idle'
}

/**
 * A partial listing (`only`) leaves the other worktrees undetailed: carry their previous details over, by resolved
 * path, while their HEAD is unchanged. Anything never detailed stays so, and the delete guard refuses it.
 */
export function mergeListing(previous: GitWorktreeListing | null | undefined, next: GitWorktreeListing): GitWorktreeListing {
  if (!previous || next.worktrees.every((w) => w.detailed)) return next
  const before = new Map(previous.worktrees.filter((w) => w.detailed).map((w) => [w.realPath, w]))
  return {
    ...next,
    realPaths: { ...previous.realPaths, ...next.realPaths },
    worktrees: next.worktrees.map((w) => {
      const old = w.detailed ? undefined : before.get(w.realPath)
      return old && old.head === w.head && old.branch === w.branch ? { ...old, path: w.path, isMain: w.isMain, locked: w.locked } : w
    })
  }
}

/** The workspace worktree records that are git's `info` (by resolved path). */
function recordsOf(listing: GitWorktreeListing, info: GitWorktreeInfo, worktrees: readonly Worktree[]): Worktree[] {
  return worktrees.filter((w) => (listing.realPaths[w.path] ?? w.path) === info.realPath || w.path === info.path)
}

/**
 * The branch each workspace worktree record git lists is on now (or is rebasing) — what the sidebar, header and
 * overview show. A detached checkout is left out and its record keeps its last branch: the record's branch is a git
 * ref too (archive restore recreates the worktree on it), so a short commit must never land there.
 */
export function branchesOf(listing: GitWorktreeListing, worktrees: readonly Worktree[]): Map<WorktreeId, string> {
  const branches = new Map<WorktreeId, string>()
  for (const info of listing.worktrees) {
    const branch = info.branch ?? info.rebasing
    if (branch) for (const w of recordsOf(listing, info, worktrees)) branches.set(w.id, branch)
  }
  return branches
}

/** Joins git's worktrees with the project's workspace worktrees (by resolved path) and their sessions, then groups them. */
export function buildRows(listing: GitWorktreeListing, worktrees: readonly Worktree[], sessions: readonly Session[]): WorktreeGroups {
  const groups: WorktreeGroups = { working: [], cleanable: [], idle: [] }
  for (const info of listing.worktrees) {
    const matched = recordsOf(listing, info, worktrees)
    const ids = new Set(matched.map((w) => w.id))
    const inside = sessions.filter((s) => ids.has(s.worktreeId)).sort(compareByUrgency)
    const name = info.branch ?? info.rebasing ?? shortSha(info.head)
    const group = groupOf(info, inside.length)
    groups[group].push({
      key: info.realPath,
      info,
      name,
      sessions: inside,
      status: inside[0]?.status ?? null,
      worktreeIds: matched.map((w) => w.id),
      openPath: matched[0]?.path ?? info.path,
      ...rowLabels(name, inside, info),
      agent: inside[0]?.kind ?? null,
      diff: formatDiff(info),
      // In 可清理 the group already says merged.
      ahead: group === 'cleanable' && info.merged ? '' : formatAhead(info)
    })
  }
  return groups
}

/**
 * Why this worktree must not be deleted, or null when it may be (after a confirmation). Anything git could not check
 * counts as a reason: unknown is never safe. Main checks the same again before removing.
 */
export function deleteBlocker(row: Pick<WorktreeRow, 'info' | 'sessions'>): string | null {
  const { info } = row
  if (info.isMain) return '主目录不能删除'
  if (row.sessions.some((s) => isActiveStatus(s.status))) return '有会话正在运行或等你处理，先结束它'
  if (!info.detailed) return '还没读完它的状态，稍后再试'
  if (info.locked) return '已被 git worktree lock 锁定'
  if (info.rebasing) return '正在变基，先完成或中止'
  if (info.dirtyCount === null) return '无法确认有没有未提交的改动'
  if (info.dirtyCount > 0) return `有 ${info.dirtyCount} 个未提交的改动，先提交或丢弃`
  if (info.branch === null && info.head) {
    if (info.unreachableCommits === null) return '无法确认它的提交是否都在分支上'
    if (info.unreachableCommits > 0) return `有 ${info.unreachableCommits} 个提交不在任何分支上，先给它建一个分支`
  }
  return null
}

export interface CleanupPlan {
  remove: WorktreeRow[]
  skip: { row: WorktreeRow; reason: string }[]
}

/** Which 可清理 worktrees one click of 清理 removes, and which it leaves (with the reason). Never one with a session. */
export function cleanupPlan(rows: readonly WorktreeRow[]): CleanupPlan {
  const plan: CleanupPlan = { remove: [], skip: [] }
  for (const row of rows) {
    const reason = row.sessions.length > 0 ? '有会话' : deleteBlocker(row)
    if (reason) plan.skip.push({ row, reason })
    else plan.remove.push(row)
  }
  return plan
}

/** What deleting keeps: the branch, or (detached) nothing, since its commits are all on other branches already. */
export function keptText(info: Pick<GitWorktreeInfo, 'branch'>): string {
  return info.branch ? `分支 ${info.branch} 保留` : '它的提交都已在其他分支上'
}

/** `picked` value for "the user collapsed the open row": no row is expanded, and the active session is not followed. */
export const COLLAPSED = ''

/** The row to show expanded: the user's pick while it still exists, else the active session's worktree (unless collapsed). */
export function selectedRow(rows: readonly WorktreeRow[], picked: string | null, activeWorktreeId: WorktreeId | null): WorktreeRow | null {
  return (
    rows.find((r) => r.key === picked) ??
    (picked === COLLAPSED ? undefined : activeWorktreeId ? rows.find((r) => r.worktreeIds.includes(activeWorktreeId)) : undefined) ??
    null
  )
}
