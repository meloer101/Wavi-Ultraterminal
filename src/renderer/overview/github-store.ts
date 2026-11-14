// 看板 · GitHub's state (PRD F9 v1.184): the scope, each project's list as main last answered it, and the item open in
// the detail overlay. Lists are asked for when the tab opens, when the scope changes and on 刷新 — never on a timer
// (main keeps an answer a minute unless 刷新 forces it). Not persisted.
import { create } from 'zustand'
import type { BoardDetailResult, BoardList, BoardScope, GitHubItemKind } from '@shared/github-board'
import type { ProjectId } from '@shared/types'
import { useWorkspace } from '../state/workspace'

export interface ProjectLoad {
  loading: boolean
  /** The last answer (kept while a new one loads, so the rows do not flash away). */
  list: BoardList | null
}

export interface OpenItem {
  projectId: ProjectId
  root: string
  kind: GitHubItemKind
  number: number
  /** null while loading. */
  result: BoardDetailResult | null
}

interface GitHubBoardState {
  scope: BoardScope
  /** By project root. */
  byRoot: Record<string, ProjectLoad | undefined>
  open: OpenItem | null
}

export const useGitHubBoard = create<GitHubBoardState>(() => ({ scope: 'all', byRoot: {}, open: null }))

/** Every request carries a number; an answer to an older one (a scope since changed) is dropped. */
let generation = 0

/** Asks main for every project's list (`force`: past main's one-minute cache, i.e. 刷新). */
export function refreshGitHub(force: boolean): void {
  const { scope } = useGitHubBoard.getState()
  const mine = ++generation
  const projects = useWorkspace.getState().projects
  useGitHubBoard.setState((s) => ({
    byRoot: Object.fromEntries(projects.map((p) => [p.rootPath, { loading: true, list: s.byRoot[p.rootPath]?.list ?? null }]))
  }))
  for (const project of projects) {
    const root = project.rootPath
    window.tr.githubBoard
      .list({ root, scope, force })
      .catch((error: unknown): BoardList => ({ gh: 'ready', project: { state: 'error', message: error instanceof Error ? error.message : String(error) } }))
      .then((list) => {
        if (mine !== generation) return
        useGitHubBoard.setState((s) => ({ byRoot: { ...s.byRoot, [root]: { loading: false, list } } }))
      })
  }
}

export function setScope(scope: BoardScope): void {
  if (useGitHubBoard.getState().scope === scope) return
  // Another scope is another list: the old rows go, so they are not read as this scope's.
  useGitHubBoard.setState({ scope, byRoot: {} })
  refreshGitHub(false)
}

export function openItem(projectId: ProjectId, root: string, kind: GitHubItemKind, number: number): void {
  useGitHubBoard.setState({ open: { projectId, root, kind, number, result: null } })
  window.tr.githubBoard
    .detail({ root, kind, number })
    .catch((error: unknown): BoardDetailResult => ({ ok: false, message: error instanceof Error ? error.message : String(error) }))
    .then((result) => {
      const open = useGitHubBoard.getState().open
      if (open?.root === root && open.kind === kind && open.number === number) useGitHubBoard.setState({ open: { ...open, result } })
    })
}

export function closeItem(): void {
  useGitHubBoard.setState({ open: null })
}
