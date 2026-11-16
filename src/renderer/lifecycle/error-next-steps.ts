// What an errored session offers next (phase 2b): the error in one line, "让 agent 修复" and a retry. Pure.
import { defineMessages, pick } from '@shared/i18n'
import { WAVI_TEXT_MARK } from '@shared/pull-requests'
import type { Session } from '@shared/types'
import type { LaunchIssue } from './launch-issues'
import { AGENT_NAME } from './present'

const M = defineMessages({
  zh: {
    worktreeFailed: (message: string) => `没能创建 worktree：${message}`,
    missingCli: (agent: string) => `没有找到 ${agent} 命令，安装后重试`,
    cwdMissing: (path: string) => `项目目录不存在：${path}`,
    spawnFailed: (message: string) => `终端无法启动：${message}`,
    exited: '进程异常退出',
    turnFailed: '这一轮出错了',
    fix: (summary: string) => `刚才出错了（${summary}）。请先找出原因并修复，然后继续之前的任务。`,
    continue: '继续'
  },
  en: {
    worktreeFailed: (message: string) => `Couldn't create the worktree: ${message}`,
    missingCli: (agent: string) => `${agent} command not found. Install it, then retry`,
    cwdMissing: (path: string) => `Project folder not found: ${path}`,
    spawnFailed: (message: string) => `Terminal couldn't start: ${message}`,
    exited: 'The process exited unexpectedly',
    turnFailed: 'This turn failed',
    fix: (summary: string) => `Something just went wrong (${summary}). Find the cause and fix it first, then continue the previous task.`,
    continue: 'continue'
  }
})

/**
 * - resume: the agent crashed; start it again on the same conversation
 * - continue: the agent is up but its turn failed (StopFailure: rate limit, API error); ask it to go on
 * - start: it never started (spawn error); try again
 */
export type RetryKind = 'resume' | 'continue' | 'start'

export interface ErrorNextSteps {
  summary: string
  /** Whether "让 agent 修复" makes sense (only when the agent itself can do something about it). */
  canFix: boolean
  retry: RetryKind | null
}

type ErrorView = Pick<Session, 'kind' | 'status' | 'phase' | 'currentAction'>

/**
 * `limitNote`: the turn failed because the plan's limit is used up (shared/limit-resume.ts), e.g. `Claude 额度用完 ·
 * 17:22 恢复`. The agent cannot fix that, so there is no 让 agent 修复; the header's 恢复后发送“继续” waits for the reset.
 */
export function errorNextSteps(session: ErrorView, issue?: LaunchIssue, limitNote?: string): ErrorNextSteps | null {
  const m = pick(M)
  if (issue?.kind === 'worktree-failed') return { summary: m.worktreeFailed(issue.message), canFix: false, retry: null }
  if (session.kind === 'shell') return null
  if (issue?.kind === 'missing-cli') return { summary: m.missingCli(AGENT_NAME[session.kind]), canFix: false, retry: 'start' }
  if (issue?.kind === 'cwd-missing') return { summary: m.cwdMissing(issue.path), canFix: false, retry: null }
  if (issue?.kind === 'spawn-failed') return { summary: m.spawnFailed(issue.message), canFix: false, retry: 'start' }
  if (session.status !== 'error') return null
  if (session.phase === 'exited') return { summary: session.currentAction ?? m.exited, canFix: true, retry: 'resume' }
  if (limitNote) return { summary: limitNote, canFix: false, retry: 'continue' }
  return { summary: session.currentAction ?? m.turnFailed, canFix: true, retry: 'continue' }
}

/** The prompt "让 agent 修复" sends: one line, so the send protocol treats it as typed text. */
export function fixPrompt(summary: string): string {
  // The error line is the agent's or the app's, not the user's: marked so the review never reads it as what was asked.
  return `${WAVI_TEXT_MARK}${pick(M).fix(summary)}`
}

/** What "重试" sends when the agent is up but its turn failed, in the interface language. */
export function continuePrompt(): string {
  return pick(M).continue
}
