// What the merge sheet (PRD F4, Figma 05) says about a precheck, its options and a result. Pure.
import type { GitOperation, MergeBlocker, MergePrecheck } from '@shared/git-merge'
import type { AgentKind, Session } from '@shared/types'
import { checksText, checksVerdict, type TurnCheckView } from '@shared/turn-checks'
import { shortAgentName } from '@shared/agents'
import { conflictReason, MAX_PROMPT_CHARS, mergeConflictPrompt } from '@shared/ship-chain'

/** `muted`: a plain fact, neither good nor bad (还没有自己的提交). */
export type CheckTone = 'ok' | 'warn' | 'error' | 'working' | 'muted'

export interface CheckLine {
  tone: CheckTone
  text: string
  /** Right-aligned, monospaced (↑3, ↓1). */
  meta?: string
}

const OPERATION: Record<GitOperation, string> = { merge: '合并', rebase: '变基', 'cherry-pick': 'cherry-pick', revert: 'revert' }

/** One line for a blocker; the sheet offers nothing but 关闭 then. */
export function blockerText(blocker: MergeBlocker, check: Pick<MergePrecheck, 'base' | 'branch'>): string {
  switch (blocker.kind) {
    case 'detached':
      return '这个 worktree 不在任何分支上'
    case 'no-base':
      return '不知道要合并到哪个分支'
    case 'base-missing':
      return `${blocker.base} 不是本地分支`
    case 'busy':
      return `${blocker.where === 'worktree' ? '这个 worktree' : `${check.base} 所在的目录`}正在${OPERATION[blocker.operation]}，先完成或中止它`
    case 'nothing':
      return blocker.merged ? `${check.branch} 已经全部合并到 ${check.base}` : `${check.branch} 还没有自己的提交`
    case 'old-git':
      return 'git 版本太旧，需要 2.38 或更新'
    case 'base-dirty':
      return `${check.base} 所在的目录有未提交的改动，和这次合并改到了同样的文件：${blocker.files.join('、')}`
    case 'main':
      return '这是项目主目录，没有要合并到的分支'
    case 'worktree-dirty':
      return 'worktree 里有未提交的改动，不能 rebase'
    case 'unverified':
      return `检查失败：${blocker.message}`
  }
}

/** Nothing to merge (Figma 30B / 30C): the sheet only says where the branch stands and offers 关闭. */
export function nothingToMerge(check: MergePrecheck): boolean {
  return check.blocker?.kind === 'nothing'
}

/** The checklist under the title, most important first. */
export function checkLines(check: MergePrecheck): CheckLine[] {
  const lines: CheckLine[] = []
  if (check.blocker?.kind === 'nothing') {
    // An outcome, not an error. Uncommitted work is still said: it is why there is nothing yet.
    const text = blockerText(check.blocker, check)
    lines.push(check.blocker.merged ? { tone: 'ok', text, meta: check.head.slice(0, 7) } : { tone: 'muted', text, meta: '领先 0' })
    lines.push(...uncommittedLines(check))
    return lines
  }
  if (check.blocker) return [{ tone: 'error', text: blockerText(check.blocker, check) }]
  lines.push({ tone: 'ok', text: `领先 ${check.base} ${check.ahead} 个提交`, meta: `↑${check.ahead}` })
  if (check.conflicts.length > 0) {
    lines.push({
      tone: 'warn',
      text: check.behind > 0 ? `${check.base} 有 ${check.behind} 个新提交，与本分支冲突` : `与 ${check.base} 冲突`,
      meta: check.behind > 0 ? `↓${check.behind}` : undefined
    })
  } else if (check.behind > 0) {
    lines.push({ tone: 'ok', text: `${check.base} 有 ${check.behind} 个新提交，可以自动合并`, meta: `↓${check.behind}` })
  }
  lines.push(...uncommittedLines(check))
  if (check.upstream && check.upstreamAhead > 0) {
    lines.push({ tone: 'warn', text: `${check.upstream} 有 ${check.upstreamAhead} 个提交还没拉到本地 ${check.base}` })
  }
  return lines
}

function uncommittedLines(check: MergePrecheck): CheckLine[] {
  if (check.uncommitted === null) return [{ tone: 'warn', text: '读不出 worktree 里有没有未提交的改动' }]
  if (check.uncommitted > 0) return [{ tone: 'warn', text: `worktree 里有 ${check.uncommitted} 个未提交的改动，不会合并进去` }]
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
  switch (state.status) {
    case 'running':
      return { tone: 'working', text: '正在运行测试…', meta }
    case 'passed':
      return { tone: 'ok', text: '测试通过', meta }
    case 'failed':
      return {
        tone: 'error',
        text: state.code === null ? '测试没能运行' : `测试没通过（退出码 ${state.code}）`,
        meta,
        ...(state.output.trim() !== '' ? { output: state.output.trim() } : {}),
        rerun: true
      }
    case 'declined':
      return { tone: 'error', text: '没有允许运行测试', meta, rerun: true }
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
  return [{ tone: 'ok', text: `已合并到 ${base}`, meta: result.commit.slice(0, 7) }]
}
