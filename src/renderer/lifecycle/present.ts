// How an agent phase reads in the sidebar and the header (Figma Screen 10). Pure.
import { AGENT_SPECS, CLI_AGENTS } from '@shared/agents'
import { defineMessages, localized, pick } from '@shared/i18n'
import { hasStartChoice } from '../state/session-start-plan'
import type { AgentKind, Session, SessionStatus } from '@shared/types'

const AGENT_LABELS = Object.fromEntries(CLI_AGENTS.map((id) => [id, AGENT_SPECS[id].label]))

export const AGENT_NAME: Record<AgentKind, string> = localized(
  defineMessages({ zh: { ...AGENT_LABELS, shell: '终端' } as Record<AgentKind, string>, en: { ...AGENT_LABELS, shell: 'Terminal' } as Record<AgentKind, string> })
)

const M = defineMessages({
  zh: {
    starting: (agent: string) => `正在启动 ${agent}…`,
    notStartedResume: '未启动 · 点击恢复上次对话',
    notStarted: '未启动',
    exited: (agent: string) => `${agent} 已退出`
  },
  en: {
    starting: (agent: string) => `Starting ${agent}…`,
    notStartedResume: 'Not started · click to resume the last conversation',
    notStarted: 'Not started',
    exited: (agent: string) => `${agent} exited`
  }
})

type PhaseView = Pick<Session, 'kind' | 'status' | 'phase'>

/** The glyph for a session: a starting agent shows the working spinner, everything else its status. */
export function glyphStatus(session: Pick<Session, 'status' | 'phase'>): SessionStatus {
  return session.phase === 'starting' ? 'running' : session.status
}

/** Sidebar secondary line while the agent is not simply up (`undefined`: use the usual action / location line). */
export function phaseLine(session: PhaseView & Pick<Session, 'agentSessionId'>): string | undefined {
  const m = pick(M)
  switch (session.phase) {
    case 'starting':
      return m.starting(AGENT_NAME[session.kind])
    case 'not-started':
      return hasStartChoice(session) ? m.notStartedResume : m.notStarted
    case 'exited':
      // A crash keeps its message (status error).
      return session.status === 'error' ? undefined : m.exited(AGENT_NAME[session.kind])
    default:
      return undefined
  }
}

/** How to install an agent CLI that is not on the login shell's PATH (first-run screen). */
export const INSTALL_HINT = {
  claude: 'npm install -g @anthropic-ai/claude-code',
  codex: 'npm install -g @openai/codex'
} as const
