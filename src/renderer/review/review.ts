// 让 agent 审阅 (PRD F13): sends the agent's own review command to the session; the review stays in the TUI. Pure
// parts first (which command, why not now), then the action.
import type { AgentKind, Session, SessionId } from '@shared/types'
import { defineMessages, pick } from '@shared/i18n'
import { ensureAgentUp } from '../lifecycle/agent-up'
import { submitPrompt } from '../session-io'
import { useWorkspace } from '../state/workspace'

const M = defineMessages({
  zh: {
    noAgent: '终端会话没有 agent',
    starting: 'agent 正在启动',
    blocked: '终端里有提示要先处理',
    running: 'agent 正在运行，等这一轮结束',
    needsYou: 'agent 在等你处理',
    noSession: '会话不存在',
    cannotReview: '不能审阅'
  },
  en: {
    noAgent: 'A terminal session has no agent',
    starting: 'The agent is starting',
    blocked: 'The terminal has a prompt to deal with first',
    running: 'The agent is running; wait for this turn to end',
    needsYou: 'The agent needs you',
    noSession: "The session doesn't exist",
    cannotReview: "Can't review"
  }
})

/** Claude Code reviews with `/code-review`, Codex with `/review`; a plain terminal has no agent. */
export function reviewCommand(kind: AgentKind): string | null {
  if (kind === 'claude') return '/code-review'
  if (kind === 'codex') return '/review'
  return null
}

/**
 * Why a review cannot be asked for now; null when it can. An agent that is not running is started again on its
 * conversation first, so only a busy or not-yet-ready one is refused.
 */
export function reviewBlocker(session: Pick<Session, 'kind' | 'phase' | 'status'>): string | null {
  const m = pick(M)
  if (reviewCommand(session.kind) === null) return m.noAgent
  if (session.phase === 'starting') return m.starting
  if (session.phase === 'blocked') return m.blocked
  if (session.phase === 'exited' || session.phase === 'not-started') return null
  if (session.status === 'running') return m.running
  if (session.status === 'needs_you') return m.needsYou
  return null
}

/** Starts the agent again if needed, then types its review command. Rejects with a user-facing message. */
export async function requestReview(sessionId: SessionId): Promise<void> {
  const session = useWorkspace.getState().sessions.find((s) => s.id === sessionId)
  if (!session) throw new Error(pick(M).noSession)
  const command = reviewCommand(session.kind)
  const blocker = reviewBlocker(session)
  if (!command || blocker) throw new Error(blocker ?? pick(M).cannotReview)
  await ensureAgentUp(sessionId)
  await submitPrompt(sessionId, command)
}
