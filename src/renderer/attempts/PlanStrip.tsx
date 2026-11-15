// Under the terminal while the session's agent waits for its plan to be approved (Figma 26C): 同任务多解… starts the
// dialog from the plan's text. Approving or rejecting stays in the agent's own TUI.
import { agentName } from '@shared/agents'
import { promptPreview } from '@shared/attempt-groups'
import { defineMessages } from '@shared/i18n'
import type { SessionId } from '@shared/types'
import { useMessages } from '../ui/i18n'
import { useSessionView } from '../state/workspace'
import { PromptStrip } from './PromptStrip'
import { openSameTask } from './same-task-store'
import { useTaskSources } from './sources'

const M = defineMessages({
  zh: { planned: (agent: string) => `${agent} 写好了计划`, sameTask: '同任务多解…' },
  en: { planned: (agent: string) => `${agent} wrote a plan`, sameTask: 'Same task, several tries…' }
})

export function PlanStrip({ sessionId }: { sessionId: SessionId }) {
  const m = useMessages(M)
  const active = useSessionView(sessionId)
  const session = active?.session
  const plan = useTaskSources((s) => (session ? s.plans[session.id] : undefined))
  if (!session || session.kind === 'shell' || !plan) return null
  return (
    <PromptStrip
      testId="plan-strip"
      question={m.planned(agentName(session.kind))}
      detail={promptPreview(plan, 200)}
      actions={[{ label: m.sameTask, keys: '⇧⌘N', onClick: () => openSameTask(session.id, '') }]}
    />
  )
}
