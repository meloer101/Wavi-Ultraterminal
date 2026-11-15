// Under the terminal of a session whose 同任务多解 report could not go through its agent's own channel (Figma 26J):
// 送进去 types it as a message, which the user chose to send; a dialog on its screen refuses that like any send (§6.9).
import { useState } from 'react'
import { defineMessages } from '@shared/i18n'
import type { SessionId } from '@shared/types'
import { useMessages } from '../i18n'
import { useSessionView } from '../state/workspace'
import { PromptStrip } from './PromptStrip'
import { sendHeldAttemptReport, useAttemptReports } from './report'

const M = defineMessages({
  zh: { allDone: (n: number) => `同任务多解的 ${n} 份都做完了`, send: '送进去' },
  en: { allDone: (n: number) => (n === 1 ? 'The 1 try of the same task is done' : `All ${n} tries of the same task are done`), send: 'Send it in' }
})

export function HeldAttemptReportStrip({ sessionId }: { sessionId: SessionId }) {
  const m = useMessages(M)
  const active = useSessionView(sessionId)
  const id = active?.session.id ?? null
  const held = useAttemptReports((s) => (id ? s.held[id] : undefined))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!id || !held) return null
  const send = (): void => {
    setBusy(true)
    void sendHeldAttemptReport(id).then((problem) => {
      setBusy(false)
      setError(problem)
    })
  }
  return (
    <PromptStrip
      testId="held-attempt-report"
      question={error ?? m.allDone(held.count)}
      detail={held.summary}
      actions={[{ label: m.send, disabled: busy, onClick: send }]}
    />
  )
}
