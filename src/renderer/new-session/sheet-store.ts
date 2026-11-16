// Whether the new-session sheet is open, and for which project (⌘N: the current one; a project's ＋: that one), with
// 作为 leader already on (a project's ⋯ · 新建 leader…, PRD F21 v1.198); and
// the installed agents its quicker sibling, 在此新建会话, lists at once.
import { create } from 'zustand'
import type { AgentAvailability } from '@shared/ipc'
import type { GitHubLink, ProjectId } from '@shared/types'

/**
 * 看板 · GitHub's 交给 agent (PRD F9 v1.184, Figma 77E): the item the new session works on. The project is fixed,
 * a 任务 row holds the first message (editable), and 创建 also sends it.
 */
export interface SheetTask {
  link: GitHubLink
  /** `#139 结算页在 Safari 17 上白屏`: the session's title and the sheet's subtitle. */
  title: string
  prompt: string
  /** The new branch: a same-repository PR's own head branch, else null for one made from the item (itemBranch). */
  branch: string | null
  /** What the item's branch is named after when `branch` is null. */
  branchFrom: { kind: GitHubLink['kind']; number: number; title: string }
  /** The base to merge into (a PR's base branch); null = the project's default. */
  base: string | null
  /** A PR's head, where the worktree starts (WorktreeCreateRequest.startAt). */
  startAt?: string
}

export const useNewSessionSheet = create<{ open: boolean; projectId: ProjectId | null; leader: boolean; generation: number; task: SheetTask | null }>()(() => ({
  open: false,
  projectId: null,
  leader: false,
  generation: 0,
  task: null
}))

let restoreFocus: HTMLElement | null = null

export function openNewSessionSheet(projectId: ProjectId | null, task: SheetTask | null = null, options: { leader?: boolean } = {}): void {
  if (useNewSessionSheet.getState().open) return
  const active = document.activeElement
  restoreFocus = active instanceof HTMLElement && active !== document.body ? active : null
  useNewSessionSheet.setState((s) => ({ open: true, projectId, task, leader: options.leader === true, generation: s.generation + 1 }))
}

/** `refocus`: give the keyboard back to what had it (cancel); after 创建 the new session's terminal takes it instead. */
export function closeNewSessionSheet(refocus: boolean): void {
  if (!useNewSessionSheet.getState().open) return
  useNewSessionSheet.setState({ open: false })
  const target = restoreFocus
  restoreFocus = null
  // After React removes the sheet, so the key that closed it does not land in the restored element.
  if (refocus) requestAnimationFrame(() => target?.focus())
}

export const isNewSessionSheetOpen = (): boolean => useNewSessionSheet.getState().open

let lastFound: AgentAvailability | null = null

/**
 * Which agent CLIs are installed, for a menu that must open at once (在此新建会话): the last answer, asking again
 * behind it; only the first time waits for main (which caches its own answer for a few seconds).
 */
export function installedAgents(): Promise<AgentAvailability | null> {
  const next = window.tr.app
    .detectAgents()
    .then((found) => (lastFound = found))
    .catch(() => lastFound)
  return lastFound ? Promise.resolve(lastFound) : next
}
