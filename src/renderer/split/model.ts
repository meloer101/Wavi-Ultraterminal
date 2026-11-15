// What the split's panes show besides terminals (PRD F20 · Figma 21): the new pane's session list after ⌘D / ⇧⌘D,
// and the words on a drop target. Pure.
import { hasPane, type SplitDrop, type SplitHandle, type SplitNode } from '@shared/split-layout'
import type { Project, Session, SessionId, Worktree } from '@shared/types'
import { defineMessages, pick } from '@shared/i18n'
import { buildOverview, type OverviewRow } from '../overview/model'
import { buildSidebarGroups, visibleSessionIds } from '../sidebar/model'

const M = defineMessages({
  zh: {
    max: '最多 4 格 · 放到格子中间来替换',
    noRoom: '这里放不下新的一格 · 放到格子中间来替换',
    swap: '松开交换这两格',
    replace: '松开换掉这一格',
    move: '松开把这一格挪到这里',
    show: '松开在这里显示这个会话'
  },
  en: {
    max: 'At most 4 panes · drop in the middle of one to replace it',
    noRoom: 'No room for another pane here · drop in the middle of one to replace it',
    swap: 'Release to swap these panes',
    replace: 'Release to replace this pane',
    move: 'Release to move this pane here',
    show: 'Release to show this session here'
  }
})

export interface PickerInput {
  projects: Project[]
  worktrees: Worktree[]
  sessions: Session[]
  /** Sessions shown in some pane of some window (F20 · 多窗口): not offered. */
  shown: readonly SessionId[]
  now: number
  /** Free text plus `p:项目` / `s:状态`, as in the overview's filter. */
  filter: string
}

/** Sessions the new pane can show: every listed one not shown already, in sidebar order (folded projects too). */
export function pickerRows({ projects, worktrees, sessions, shown: shownIds, now, filter }: PickerInput): OverviewRow[] {
  const shown = new Set(shownIds)
  const order = new Map(visibleSessionIds(buildSidebarGroups({ projects, worktrees, sessions, collapsedProjectIds: [] })).map((id, i) => [id, i]))
  return buildOverview({ projects, worktrees, sessions, now, filter })
    .flatMap((group) => group.rows)
    .filter((row) => !shown.has(row.session.id) && order.has(row.session.id))
    .sort((a, b) => (order.get(a.session.id) ?? 0) - (order.get(b.session.id) ?? 0))
}

/** The caption on a drop target (Figma 21D / 21E). */
export function dropLabel(drop: SplitDrop, dragged: SessionId, root: SplitNode | null): string {
  const m = pick(M)
  if ('refused' in drop) return drop.refused === 'max' ? m.max : m.noRoom
  const moving = hasPane(root, dragged)
  if (drop.zone === 'center') return moving ? m.swap : m.replace
  return moving ? m.move : m.show
}

/**
 * The hairlines in paint order: deeper splits first, so where two cross (a T-junction) the outer split's line, the
 * longer one, is on top and takes the press. Equal stacking left it to DOM order, which put the inner line on top:
 * on a 1× display a grab at the junction, half a pixel right of the long line, dragged the short one.
 */
export function stackHandles(handles: readonly SplitHandle[]): SplitHandle[] {
  return [...handles].sort((a, b) => b.path.length - a.path.length)
}
