// 同任务多解 in the overview (PRD F9 v1.59 / F4 v1.68, Figma 26G): one row per attempt group above the status groups —
// the task, the session it reports to (or the base, for groups from before v1.68), every member as its status glyph
// and name — with 比较
// (the overlay with the members side by side) and, once one was merged, 归档其余 N 份 (asks first). In the overlay each
// member's window gets a compare bar under its title bar: what it changed, the checks it ran, how its launch went,
// 看 diff and 合并这个. Status is the glyph's shape plus text, never color alone.
import { memo, useEffect, useMemo, useState } from 'react'
import { AlertCircle, GitCompareArrows, GitMerge } from '../ui/icons'
import { useShallow } from 'zustand/react/shallow'
import {
  diffSummary,
  diffSummaryText,
  groupShown,
  memberLabels,
  promptPreview,
  remainingMembers,
  type AttemptGroup,
  type DiffSummary
} from '@shared/attempt-groups'
import type { Session, SessionId } from '@shared/types'
import { defineMessages } from '@shared/i18n'
import { useMessages } from '../ui/i18n'
import { glyphStatus } from '../lifecycle/present'
import { GROUP_LABEL } from '../overview/model'
import { showCompare } from '../overview/store'
import enterStyles from '../overview/EnterButton.module.css'
import { useAttemptGroups, type MemberLaunch } from '../state/attempt-groups'
import { useWorkspace } from '../state/workspace'
import { TurnChecksTag } from '../turn-checks/TurnChecksTag'
import { StatusGlyph } from '../ui/StatusGlyph'
import { archiveRemaining, mergeMember, openMemberDiff, remainingBranches, resend } from './actions'
import styles from './AttemptGroups.module.css'

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const
const DIFF_POLL_MS = 4000

const M = defineMessages({
  zh: {
    title: '同任务多解',
    notArchived: (failures: string[]) => `没有归档：${failures.join('；')}`,
    reportTo: (title: string) => `汇报给 ${title}`,
    basedOn: (base: string) => `基于 ${base}`,
    mergedBranch: (branch: string) => `已合并 ${branch}`,
    listSep: '、',
    archiveTitle: (branches: string) => `先确认，再归档 ${branches}；可以在跳转（⌘K）的历史里恢复`,
    archiving: '正在归档…',
    archiveRest: (n: number) => `归档其余 ${n} 份`,
    compareTitle: '在浮层里并排看这几份的终端、改动和检查',
    compare: '比较',
    creating: '正在创建 worktree…',
    starting: '等 agent 启动后发送…',
    sending: '正在发送…',
    diffError: '读不出改动',
    notSent: (message: string) => `没发出去：${message}`,
    resendTitle: '把任务再发给这一份一次（用你自己的额度）',
    resend: '再发一次',
    diffTitle: '进入这个会话，打开 Git · 变更',
    diff: '看 diff',
    merged: '已合并',
    mergeTitle: (branch: string, base: string) => `把 ${branch} 合并到 ${base}（先预检）`,
    merge: '合并这个'
  },
  en: {
    title: 'Same task, several tries',
    notArchived: (failures: string[]) => `Not archived: ${failures.join('; ')}`,
    reportTo: (title: string) => `Reports to ${title}`,
    basedOn: (base: string) => `Based on ${base}`,
    mergedBranch: (branch: string) => `Merged ${branch}`,
    listSep: ', ',
    archiveTitle: (branches: string) => `Asks first, then archives ${branches}; restore them from History in Jump to (⌘K)`,
    archiving: 'Archiving…',
    archiveRest: (n: number) => (n === 1 ? 'Archive the other 1' : `Archive the other ${n}`),
    compareTitle: "See these tries' terminals, changes and checks side by side in an overlay",
    compare: 'Compare',
    creating: 'Creating worktree…',
    starting: 'Sends once the agent is up…',
    sending: 'Sending…',
    diffError: "Couldn't read the changes",
    notSent: (message: string) => `Not sent: ${message}`,
    resendTitle: 'Send the task to this try again (uses your own usage)',
    resend: 'Send again',
    diffTitle: 'Open this session with Git · Changes',
    diff: 'View diff',
    merged: 'Merged',
    mergeTitle: (branch: string, base: string) => `Merge ${branch} into ${base} (checks first)`,
    merge: 'Merge this'
  }
})

interface MemberView {
  session: Session
  label: string
  branch: string
  path: string
}

/** The group's members still listed, each with its name in the group (`Claude Code 1`, `Codex`) and branch. */
function useMembers(group: AttemptGroup | undefined): MemberView[] {
  const { sessions, worktrees } = useWorkspace(useShallow((s) => ({ sessions: s.sessions, worktrees: s.worktrees })))
  return useMemo(() => {
    if (!group) return []
    const found = group.members.flatMap((id) => {
      const session = sessions.find((x) => x.id === id)
      const worktree = session && worktrees.find((w) => w.id === session.worktreeId)
      return session && worktree && !worktree.archived ? [{ session, worktree }] : []
    })
    // Members are agent sessions; a shell can only be one through a hand-edited file.
    const labels = memberLabels(found.map((m) => (m.session.kind === 'shell' ? 'claude' : m.session.kind)))
    return found.map((m, i) => ({ session: m.session, label: labels[i] ?? '', branch: m.worktree.branch, path: m.worktree.path }))
  }, [group, sessions, worktrees])
}

const listedIn = (members: readonly MemberView[]) => (id: SessionId) => members.some((m) => m.session.id === id)

export function AttemptGroups() {
  const groups = useAttemptGroups((s) => s.groups)
  const { sessions, worktrees } = useWorkspace(useShallow((s) => ({ sessions: s.sessions, worktrees: s.worktrees })))
  const listed = useMemo(() => {
    const archived = new Set(worktrees.filter((w) => w.archived).map((w) => w.id))
    return new Set(sessions.filter((x) => !archived.has(x.worktreeId)).map((x) => x.id))
  }, [sessions, worktrees])
  const m = useMessages(M)
  const shown = groups.filter((g) => groupShown(g, (id) => listed.has(id)))
  if (shown.length === 0) return null
  return (
    <section className={styles.section} aria-label={m.title} data-testid="attempt-groups">
      <div className={styles.header}>
        <h2>{m.title}</h2>
        <span className={styles.count}>{shown.length}</span>
      </div>
      {shown.map((g) => (
        <GroupRow key={g.id} group={g} />
      ))}
    </section>
  )
}

function GroupRow({ group }: { group: AttemptGroup }) {
  const m = useMessages(M)
  const members = useMembers(group)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const left = remainingMembers(group, listedIn(members))
  const comparable = members.filter((m) => m.session.id !== group.merged?.sessionId)
  const parentTitle = useWorkspace((s) => (group.reportTo ? (s.sessions.find((x) => x.id === group.reportTo)?.title ?? null) : null))

  const archive = async (): Promise<void> => {
    setBusy(true)
    setNotice(null)
    const result = await archiveRemaining(group)
    setBusy(false)
    if (result.failures.length > 0) setNotice(m.notArchived(result.failures))
  }

  return (
    <div className={styles.row} data-group-id={group.id} data-testid="attempt-group">
      <span className={styles.icon}>
        <GitCompareArrows {...ICON} />
      </span>
      <span className={styles.task} title={group.prompt}>
        {promptPreview(group.prompt)}
      </span>
      <span className={styles.base}>{parentTitle !== null ? m.reportTo(parentTitle) : m.basedOn(group.base)}</span>
      <span className={styles.members}>
        {members.map((member) => {
          const status = glyphStatus(member.session)
          const text = `${member.label} · ${GROUP_LABEL[status]} · ${member.branch}`
          return (
            <span key={member.session.id} className={styles.member} title={text} aria-label={text} data-member-id={member.session.id}>
              <StatusGlyph status={status} />
              <span>{member.label}</span>
            </span>
          )
        })}
      </span>
      {group.merged && (
        <span className={styles.merged}>
          <GitMerge size={12} strokeWidth={2} aria-hidden />
          {m.mergedBranch(group.merged.branch)}
        </span>
      )}
      {notice && (
        <span className={styles.notice} role="status">
          {notice}
        </span>
      )}
      <span className={styles.spacer} />
      {group.merged && left.length > 0 && (
        <button
          type="button"
          className={enterStyles.enter}
          disabled={busy}
          title={m.archiveTitle(remainingBranches(group).map((b) => b.branch).join(m.listSep))}
          onClick={() => void archive()}
        >
          {busy ? m.archiving : m.archiveRest(left.length)}
        </button>
      )}
      {comparable.length > 0 && (
        <button
          type="button"
          className={enterStyles.enter}
          title={m.compareTitle}
          onClick={() => showCompare(group.id, comparable.map((c) => c.session.id))}
        >
          {m.compare}
        </button>
      )}
    </div>
  )
}

/** What a member's worktree changed against the base: `+12 −3 · 2 个文件`, polled while it is on screen. */
function useDiffSummary(path: string | undefined, base: string): DiffSummary | 'error' | null {
  const [summary, setSummary] = useState<DiffSummary | 'error' | null>(null)
  useEffect(() => {
    if (!path) return
    let live = true
    const load = (): void => {
      window.tr.git
        .changes(path, base)
        .then((changes) => live && setSummary(changes ? diffSummary(changes) : 'error'))
        .catch(() => live && setSummary('error'))
    }
    load()
    const timer = window.setInterval(load, DIFF_POLL_MS)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [path, base])
  return summary
}

const launchText = (m: (typeof M)['zh'], phase: Exclude<MemberLaunch['phase'], 'failed'>): string | null =>
  ({ creating: m.creating, starting: m.starting, sending: m.sending, sent: null })[phase]

/** The bar under a member's title bar in the compare overlay. */
export const CompareBar = memo(function CompareBar({ groupId, sessionId }: { groupId: string; sessionId: SessionId }) {
  const m = useMessages(M)
  const group = useAttemptGroups((s) => s.groups.find((g) => g.id === groupId))
  const launch = useAttemptGroups((s) => s.launches[sessionId])
  const members = useMembers(group)
  const member = members.find((m) => m.session.id === sessionId)
  const diff = useDiffSummary(member?.path, group?.base ?? '')
  if (!group || !member) return null
  const merged = group.merged?.sessionId === sessionId
  const launchLine = launch && launch.phase !== 'failed' ? launchText(m, launch.phase) : null
  return (
    <div className={styles.compare} data-testid="attempt-compare" data-member-id={sessionId}>
      <span className={styles.compareLabel}>{member.label}</span>
      <span className={styles.diff} data-testid="attempt-diff">
        {diff === null ? '…' : diff === 'error' ? m.diffError : diffSummaryText(diff)}
      </span>
      <TurnChecksTag sessionId={sessionId} />
      {launchLine && <span className={styles.launch}>{launchLine}</span>}
      {launch?.phase === 'failed' && (
        <span className={styles.failed} role="status" title={launch.message}>
          <AlertCircle size={12} strokeWidth={2} aria-hidden />
          {m.notSent(launch.message)}
        </span>
      )}
      <span className={styles.spacer} />
      {launch?.phase === 'failed' && (
        <button type="button" className={enterStyles.enter} title={m.resendTitle} onClick={() => resend(sessionId)}>
          {m.resend}
        </button>
      )}
      <button type="button" className={enterStyles.enter} title={m.diffTitle} onClick={() => openMemberDiff(sessionId)}>
        {m.diff}
      </button>
      {merged ? (
        <span className={styles.mergedTag}>
          <GitMerge size={12} strokeWidth={2} aria-hidden />
          {m.merged}
        </span>
      ) : (
        <button type="button" className={enterStyles.enter} title={m.mergeTitle(member.branch, group.base)} onClick={() => mergeMember(sessionId)}>
          {m.merge}
        </button>
      )}
    </div>
  )
})
