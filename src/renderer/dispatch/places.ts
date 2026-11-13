// Where a session sits in the workspace (session, worktree, project) and what the dispatch reports say about it:
// read by the wavi handler, the reports it sends and the 同任务多解 report.
import type { Project, Session, SessionId, Worktree } from '@shared/types'
import { checksText, turnCheckView } from '@shared/turn-checks'
import { markFor, useRadar } from '../conflict-radar/store'
import { useSessionMeta } from '../session-meta/store'
import { useWorkspace } from '../state/workspace'

export interface Place {
  session: Session
  worktree: Worktree
  project: Project
}

export function placeOf(id: SessionId): Place | null {
  const state = useWorkspace.getState()
  const session = state.sessions.find((s) => s.id === id)
  const worktree = session && state.worktrees.find((w) => w.id === session.worktreeId)
  const project = worktree && state.projects.find((p) => p.id === worktree.projectId)
  return session && worktree && project ? { session, worktree, project } : null
}

/** The project's leader session (PRD F21 v1.178), or null. */
export function leaderOfProject(projectId: string): SessionId | null {
  return useWorkspace.getState().leaderSessions?.[projectId] ?? null
}

/** Whether this session is its project's leader. */
export function isLeaderSession(id: SessionId): boolean {
  const place = placeOf(id)
  return place !== null && leaderOfProject(place.project.id) === id
}

/** The sessions this one dispatched, listed ones first (an archived child is still its child). */
export function childrenOf(parentId: SessionId): Place[] {
  return useWorkspace
    .getState()
    .sessions.filter((s) => s.dispatchedBy === parentId)
    .flatMap((s) => placeOf(s.id) ?? [])
}

/** `测试 ✓ · …` of the session's last turn, if it ran any checks. */
export function checksOf(id: SessionId): string | undefined {
  const view = turnCheckView(useSessionMeta.getState().bySession[id]?.checks)
  return view ? checksText(view) : undefined
}

/** The conflict radar's word for the worktree, if it has one. */
export function conflictsOf(place: Place): string | undefined {
  return markFor(useRadar.getState().byRoot[place.project.rootPath], place.worktree.path)?.label
}
