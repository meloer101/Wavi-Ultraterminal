// 合并到 GitHub PR (PRD F16 v1.63, Figma 22C / 22D), the pure part: the checklist from the PR as main last read it,
// what stops a merge now, and whether 合并 becomes 检查通过后合并. GitHub's branch protection still has the last word.
import { AUTO_MERGE_OFF, type MergeMethod, type PrStatus } from '@shared/pull-requests'
import { defineMessages, pick } from '@shared/i18n'
import type { CheckLine } from './model'

const M = defineMessages({
  zh: {
    requiredFailing: (names: readonly string[]) => `必需的检查没通过：${names.join('、')}`,
    requiredFailingBlocker: '必需的检查没通过',
    requiredPending: '必需的检查还在跑',
    requiredPassed: '必需的检查通过',
    optionalFailing: (count: number) => `${count} 项检查失败（不是必需的）`,
    pending: '检查还在跑',
    passed: '检查通过',
    noChecks: '这个 PR 没有检查',
    noCompare: '没能对比本地分支和 PR',
    remoteAhead: 'PR 上有本地没有的提交：先拉取，看过再合并',
    remoteAheadBlocker: 'PR 上有本地没有的提交',
    unpushed: '本地有还没推送的提交：合并时先推送，检查重新跑完再合并',
    same: '本地和 PR 是同一份代码',
    conflict: (agent: string) => `和基线冲突：先让 ${agent} rebase`,
    conflictBlocker: '和基线冲突',
    behind: '基线已前进，分支保护可能要求先更新',
    reviewRequired: '需要审批',
    changesRequested: '有人要求修改',
    threads: (count: number) => `${count} 条评论没解决`,
    hintOnly: '只提示',
    approved: '已审批',
    draft: 'PR 还是草稿：先在 GitHub 上标记为可审阅',
    inQueue: '已经在合并队列里'
  },
  en: {
    requiredFailing: (names: readonly string[]) => `Required checks failed: ${names.join(', ')}`,
    requiredFailingBlocker: 'Required checks failed',
    requiredPending: 'Required checks still running',
    requiredPassed: 'Required checks passed',
    optionalFailing: (count: number) => `${count} ${count === 1 ? 'check' : 'checks'} failed (not required)`,
    pending: 'Checks still running',
    passed: 'Checks passed',
    noChecks: 'This PR has no checks',
    noCompare: "Couldn't compare the local branch with the PR",
    remoteAhead: "The PR has commits you don't have locally: pull first, and merge once you've looked",
    remoteAheadBlocker: "The PR has commits you don't have locally",
    unpushed: 'There are local commits not yet pushed: merging pushes them first and waits for the checks to run again',
    same: 'Local and the PR are the same code',
    conflict: (agent: string) => `Conflicts with the base: let ${agent} rebase first`,
    conflictBlocker: 'Conflicts with the base',
    behind: 'The base moved on; branch protection may require updating first',
    reviewRequired: 'Approval required',
    changesRequested: 'Changes requested',
    threads: (count: number) => `${count} unresolved ${count === 1 ? 'comment' : 'comments'}`,
    hintOnly: 'Info only',
    approved: 'Approved',
    draft: 'The PR is still a draft: mark it ready for review on GitHub first',
    inQueue: 'Already in the merge queue'
  }
})

export interface PrMergeView {
  lines: CheckLine[]
  /** Reasons 合并 cannot be pressed (main refuses the same). Empty: GitHub decides. */
  blockers: string[]
  /** Checks still run, or local commits must be pushed first: the button is 检查通过后合并 (GitHub auto-merge). */
  waitForChecks: boolean
  methods: MergeMethod[]
  defaultMethod: MergeMethod
}

const short = (oid: string): string => oid.slice(0, 7)

/** `agent`: the session's agent (Claude / Codex) that the conflict line names. */
export function prMergeView(status: PrStatus, agent = 'agent'): PrMergeView | null {
  const pr = status.pr
  const details = pr?.details
  if (!pr || !details) return null
  const m = pick(M)
  const lines: CheckLine[] = []
  const blockers: string[] = []
  // Checks: the required ones when branch protection names some, else every check.
  const required = details.required
  if (required.total > 0) {
    if (required.failing.length > 0) {
      lines.push({ tone: 'error', text: m.requiredFailing(required.failing.slice(0, 3)) })
      blockers.push(m.requiredFailingBlocker)
    } else if (required.pending > 0) lines.push({ tone: 'working', text: m.requiredPending, meta: `${required.total - required.pending}/${required.total}` })
    else lines.push({ tone: 'ok', text: m.requiredPassed, meta: `${required.total}/${required.total}` })
  } else if (pr.checks.state === 'failing') lines.push({ tone: 'warn', text: m.optionalFailing(pr.checks.failing.length), meta: pr.checks.failing[0]?.name })
  else if (pr.checks.state === 'pending') lines.push({ tone: 'working', text: m.pending, meta: `${pr.checks.passed}/${pr.checks.total}` })
  else if (pr.checks.state === 'passing') lines.push({ tone: 'ok', text: m.passed, meta: `${pr.checks.total}/${pr.checks.total}` })
  else lines.push({ tone: 'warn', text: m.noChecks })

  // Is the PR the code the user has here?
  const local = status.local
  let unpushed = false
  if (!local) lines.push({ tone: 'warn', text: m.noCompare })
  else if (local.remoteAhead) {
    lines.push({ tone: 'error', text: m.remoteAhead })
    blockers.push(m.remoteAheadBlocker)
  } else if (local.head !== details.headOid) {
    unpushed = true
    lines.push({ tone: 'warn', text: m.unpushed, meta: short(local.head) })
  } else lines.push({ tone: 'ok', text: m.same, meta: short(details.headOid) })

  if (details.mergeState === 'dirty') {
    lines.push({ tone: 'error', text: m.conflict(agent) })
    blockers.push(m.conflictBlocker)
  } else if (details.mergeState === 'behind') lines.push({ tone: 'warn', text: m.behind })

  const asks: string[] = []
  if (details.reviewDecision === 'review-required') asks.push(m.reviewRequired)
  else if (details.reviewDecision === 'changes-requested') asks.push(m.changesRequested)
  if (details.threads.length > 0) asks.push(m.threads(details.threads.length))
  if (asks.length > 0) lines.push({ tone: 'warn', text: asks.join(' · '), meta: m.hintOnly })
  else if (details.reviewDecision === 'approved') lines.push({ tone: 'ok', text: m.approved })

  if (pr.state === 'draft') blockers.push(m.draft)
  if (details.inMergeQueue) blockers.push(m.inQueue)
  const waitForChecks = !blockers.length && (unpushed || (required.total > 0 ? required.pending > 0 : pr.checks.state === 'pending'))
  // 检查通过后合并 is GitHub auto-merge only; Wavi does not wait for the checks itself.
  if (waitForChecks && !details.repo.autoMergeAllowed) blockers.push(AUTO_MERGE_OFF)
  return { lines, blockers, waitForChecks, methods: details.repo.methods, defaultMethod: details.repo.defaultMethod }
}

export const METHOD_LABEL: Record<MergeMethod, string> = { squash: 'Squash', merge: 'Merge', rebase: 'Rebase' }
