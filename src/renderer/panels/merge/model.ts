// What the merge sheet (PRD F4, Figma 05) says about a precheck, its options and a result. Pure.
import type { GitOperation, MergeBlocker, MergePrecheck } from '@shared/git-merge'
import type { AgentKind, Session } from '@shared/types'
import { checksText, checksVerdict, type TurnCheckView } from '@shared/turn-checks'
import { shortAgentName } from '@shared/agents'
import { conflictReason, MAX_PROMPT_CHARS, mergeConflictPrompt } from '@shared/ship-chain'
import { defineMessages, pick } from '@shared/i18n'

/** `muted`: a plain fact, neither good nor bad (还没有自己的提交). */
export type CheckTone = 'ok' | 'warn' | 'error' | 'working' | 'muted'

export interface CheckLine {
  tone: CheckTone
  text: string
  /** Right-aligned, monospaced (↑3, ↓1). */
  meta?: string
}

const M = defineMessages({
  zh: {
    operation: { merge: '合并', rebase: '变基', 'cherry-pick': 'cherry-pick', revert: 'revert' } as Record<GitOperation, string>,
    detached: '这个 worktree 不在任何分支上',
    noBase: '不知道要合并到哪个分支',
    baseMissing: (base: string) => `${base} 不是本地分支`,
    thisWorktree: '这个 worktree',
    baseFolder: (base: string) => `${base} 所在的目录`,
    busy: (where: string, operation: string) => `${where}正在${operation}，先完成或中止它`,
    allMerged: (branch: string, base: string) => `${branch} 已经全部合并到 ${base}`,
    noCommits: (branch: string) => `${branch} 还没有自己的提交`,
    oldGit: 'git 版本太旧，需要 2.38 或更新',
    baseDirty: (base: string, files: readonly string[]) => `${base} 所在的目录有未提交的改动，和这次合并改到了同样的文件：${files.join('、')}`,
    main: '这是项目主目录，没有要合并到的分支',
    worktreeDirty: 'worktree 里有未提交的改动，不能 rebase',
    unverified: (message: string) => `检查失败：${message}`,
    zeroAhead: '领先 0',
    ahead: (base: string, ahead: number) => `领先 ${base} ${ahead} 个提交`,
    behindConflicts: (base: string, behind: number) => `${base} 有 ${behind} 个新提交，与本分支冲突`,
    conflicts: (base: string) => `与 ${base} 冲突`,
    behindClean: (base: string, behind: number) => `${base} 有 ${behind} 个新提交，可以自动合并`,
    upstreamAhead: (upstream: string, count: number, base: string) => `${upstream} 有 ${count} 个提交还没拉到本地 ${base}`,
    uncommittedUnknown: '读不出 worktree 里有没有未提交的改动',
    uncommitted: (count: number) => `worktree 里有 ${count} 个未提交的改动，不会合并进去`,
    testRunning: '正在运行测试…',
    testPassed: '测试通过',
    testDidNotRun: '测试没能运行',
    testFailed: (code: number) => `测试没通过（退出码 ${code}）`,
    testDeclined: '没有允许运行测试',
    merged: (base: string) => `已合并到 ${base}`
  },
  en: {
    operation: { merge: 'merge', rebase: 'rebase', 'cherry-pick': 'cherry-pick', revert: 'revert' },
    detached: "This worktree isn't on any branch",
    noBase: "Don't know which branch to merge into",
    baseMissing: (base: string) => `${base} is not a local branch`,
    thisWorktree: 'This worktree',
    baseFolder: (base: string) => `The folder of ${base}`,
    busy: (where: string, operation: string) => `${where} is in the middle of a ${operation}. Finish or abort it first`,
    allMerged: (branch: string, base: string) => `${branch} is fully merged into ${base}`,
    noCommits: (branch: string) => `${branch} has no commits of its own yet`,
    oldGit: 'git is too old: 2.38 or later is needed',
    baseDirty: (base: string, files: readonly string[]) =>
      `The folder of ${base} has uncommitted changes to the same files as this merge: ${files.join(', ')}`,
    main: "This is the project's main folder; there is no branch to merge into",
    worktreeDirty: "The worktree has uncommitted changes, so it can't rebase",
    unverified: (message: string) => `Check failed: ${message}`,
    zeroAhead: '0 ahead',
    ahead: (base: string, ahead: number) => `${ahead} ${ahead === 1 ? 'commit' : 'commits'} ahead of ${base}`,
    behindConflicts: (base: string, behind: number) => `${base} has ${behind} new ${behind === 1 ? 'commit' : 'commits'} that conflict with this branch`,
    conflicts: (base: string) => `Conflicts with ${base}`,
    behindClean: (base: string, behind: number) => `${base} has ${behind} new ${behind === 1 ? 'commit' : 'commits'}, merged automatically`,
    upstreamAhead: (upstream: string, count: number, base: string) =>
      `${upstream} has ${count} ${count === 1 ? 'commit' : 'commits'} not yet pulled into local ${base}`,
    uncommittedUnknown: "Can't tell whether the worktree has uncommitted changes",
    uncommitted: (count: number) => `The worktree has ${count} uncommitted ${count === 1 ? 'change' : 'changes'}, which won't be merged`,
    testRunning: 'Running tests…',
    testPassed: 'Tests passed',
    testDidNotRun: 'Tests could not run',
    testFailed: (code: number) => `Tests failed (exit code ${code})`,
    testDeclined: 'Running the tests was not allowed',
    merged: (base: string) => `Merged into ${base}`
  }
})

/** One line for a blocker; the sheet offers nothing but 关闭 then. */
export function blockerText(blocker: MergeBlocker, check: Pick<MergePrecheck, 'base' | 'branch'>): string {
  const m = pick(M)
  switch (blocker.kind) {
    case 'detached':
      return m.detached
    case 'no-base':
      return m.noBase
    case 'base-missing':
      return m.baseMissing(blocker.base)
    case 'busy':
      return m.busy(blocker.where === 'worktree' ? m.thisWorktree : m.baseFolder(check.base), m.operation[blocker.operation])
    case 'nothing':
      return blocker.merged ? m.allMerged(check.branch, check.base) : m.noCommits(check.branch)
    case 'old-git':
      return m.oldGit
    case 'base-dirty':
      return m.baseDirty(check.base, blocker.files)
    case 'main':
      return m.main
    case 'worktree-dirty':
      return m.worktreeDirty
    case 'unverified':
      return m.unverified(blocker.message)
  }
}

/** Nothing to merge (Figma 30B / 30C): the sheet only says where the branch stands and offers 关闭. */
export function nothingToMerge(check: MergePrecheck): boolean {
  return check.blocker?.kind === 'nothing'
}

/** The checklist under the title, most important first. */
export function checkLines(check: MergePrecheck): CheckLine[] {
  const m = pick(M)
  const lines: CheckLine[] = []
  if (check.blocker?.kind === 'nothing') {
    // An outcome, not an error. Uncommitted work is still said: it is why there is nothing yet.
    const text = blockerText(check.blocker, check)
    lines.push(check.blocker.merged ? { tone: 'ok', text, meta: check.head.slice(0, 7) } : { tone: 'muted', text, meta: m.zeroAhead })
    lines.push(...uncommittedLines(check))
    return lines
  }
  if (check.blocker) return [{ tone: 'error', text: blockerText(check.blocker, check) }]
  lines.push({ tone: 'ok', text: m.ahead(check.base, check.ahead), meta: `↑${check.ahead}` })
  if (check.conflicts.length > 0) {
    lines.push({
      tone: 'warn',
      text: check.behind > 0 ? m.behindConflicts(check.base, check.behind) : m.conflicts(check.base),
      meta: check.behind > 0 ? `↓${check.behind}` : undefined
    })
  } else if (check.behind > 0) {
    lines.push({ tone: 'ok', text: m.behindClean(check.base, check.behind), meta: `↓${check.behind}` })
  }
  lines.push(...uncommittedLines(check))
  if (check.upstream && check.upstreamAhead > 0) {
    lines.push({ tone: 'warn', text: m.upstreamAhead(check.upstream, check.upstreamAhead, check.base) })
  }
  return lines
}

function uncommittedLines(check: MergePrecheck): CheckLine[] {
  if (check.uncommitted === null) return [{ tone: 'warn', text: pick(M).uncommittedUnknown }]
  if (check.uncommitted > 0) return [{ tone: 'warn', text: pick(M).uncommitted(check.uncommitted) }]
  return []
}

/** One line of the merge checklist for `[scripts] test` (Figma 16B). Absent when the file has no test. */
export type MergeTestState =
  | { status: 'running'; command: string }
  | { status: 'passed'; command: string }
  | { status: 'failed'; command: string; code: number | null; output: string }
  | { status: 'declined'; command: string }

export interface TestCheckLine extends CheckLine {
  /** Captured tail, under the line, when the test failed and printed something. */
  output?: string
  /** Ghost “重新运行”. */
  rerun?: boolean
}

/** The command as one line of meta (a multi-line script collapses). */
export function testMeta(script: string): string {
  return script.replace(/\s+/g, ' ').trim()
}

export function testLine(state: MergeTestState): TestCheckLine {
  const meta = testMeta(state.command)
  const m = pick(M)
  switch (state.status) {
    case 'running':
      return { tone: 'working', text: m.testRunning, meta }
    case 'passed':
      return { tone: 'ok', text: m.testPassed, meta }
    case 'failed':
      return {
        tone: 'error',
        text: state.code === null ? m.testDidNotRun : m.testFailed(state.code),
        meta,
        ...(state.output.trim() !== '' ? { output: state.output.trim() } : {}),
        rerun: true
      }
    case 'declined':
      return { tone: 'error', text: m.testDeclined, meta, rerun: true }
  }
}

/** A configured test blocks 合并 until it exits 0. No test does not. */
export function testBlocksMerge(state: MergeTestState | null, hasTest: boolean): boolean {
  if (!hasTest) return false
  return state?.status !== 'passed'
}

// How a file conflicts and the hand-off length cap live with the merge chain's hand-offs (src/shared/ship-chain.ts).
export { conflictReason, MAX_PROMPT_CHARS }

/** The session conflicts are handed to: the active one if it is in the worktree, else its first agent session. */
export function agentSessionFor<T extends Pick<Session, 'id' | 'kind'>>(sessions: readonly T[], activeId: string | null): T | null {
  const agents = sessions.filter((s) => s.kind !== 'shell')
  return agents.find((s) => s.id === activeId) ?? agents[0] ?? null
}

/**
 * One line put into the agent's input line (not sent; the user reads it and presses Enter): merge the base in,
 * resolve, commit, without an editor — the merge chain's builder (src/shared/ship-chain.ts): names quoted as data, the
 * base as one shell word of its full ref, the files listed while the text stays within MAX_PROMPT_CHARS.
 */
export function conflictPrompt(check: Pick<MergePrecheck, 'base' | 'branch' | 'conflicts'>): string {
  return mergeConflictPrompt({ base: check.base, branch: check.branch, conflicts: check.conflicts })
}

export function agentLabel(kind: AgentKind): string {
  return shortAgentName(kind)
}

/**
 * What the worktree's agent ran this turn (PRD F4 · “这一轮跑过哪些检查”): one line, worst outcome first, with the
 * compact summary on the right. Information only: unlike `[scripts] test`, it never blocks 合并.
 */
export function turnChecksLine(view: TurnCheckView, kind: AgentKind): CheckLine {
  const { tone, text } = checksVerdict(view, agentLabel(kind))
  return { tone, text, ...(view.kinds.length > 0 ? { meta: checksText(view) } : {}) }
}

/** Lines after a merge: the squash commit on the local base (合并 is local: 推送 of the base is the chain's next move). */
export function resultLines(result: { commit: string }, base: string): CheckLine[] {
  return [{ tone: 'ok', text: pick(M).merged(base), meta: result.commit.slice(0, 7) }]
}
