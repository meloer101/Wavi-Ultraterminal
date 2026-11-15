// Under a session's terminal (PRD F21): dispatch messages Wavi could not put in without typing — reports from the
// sessions it started, what became of its `wavi run`, or its dispatcher's `wavi send` (its agent has no channel,
// someone may be typing there, delivery failed, or it was woken 20 times this hour). 送进去 types them as a message,
// which the user chose to send; a dialog on its screen refuses that like any send (§6.9).
import { useState } from 'react'
import { Inbox } from 'lucide-react'
import { defineMessages } from '@shared/i18n'
import type { SessionId } from '@shared/types'
import { useSessionView } from '../state/workspace'
import { sendHeld } from './reports'
import { useDispatch } from './store'
import { useMessages } from '../ui/i18n'
import styles from '../scripts/SetupStrip.module.css'

const M = defineMessages({
  zh: {
    names: (titles: string[]) => titles.map((t) => `「${t}」`).join('、'),
    reports: (count: number, names: string) => `${count} 份派活报告还没送进去：${names}`,
    messages: (count: number, names: string) => `${count} 条派活消息还没送进去：${names}`,
    sendTitle: '作为一条消息发给这个会话里的 agent',
    send: '送进去'
  },
  en: {
    names: (titles: string[]) => titles.map((t) => `“${t}”`).join(', '),
    reports: (count: number, names: string) => `${count} dispatch ${count === 1 ? 'report' : 'reports'} not sent in yet: ${names}`,
    messages: (count: number, names: string) => `${count} dispatch ${count === 1 ? 'message' : 'messages'} not sent in yet: ${names}`,
    sendTitle: 'Send as one message to the agent in this session',
    send: 'Send in'
  }
})

export function HeldReportsStrip({ sessionId }: { sessionId: SessionId }) {
  const m = useMessages(M)
  const active = useSessionView(sessionId)
  const id = active?.session.id ?? null
  const held = useDispatch((s) => (id ? s.held[id] : undefined))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!id || !held || held.length === 0) return null
  const names = m.names(held.map((i) => (i.kind === 'report' ? i.report.title : i.title)))
  const label = held.every((i) => i.kind === 'report') ? m.reports(held.length, names) : m.messages(held.length, names)
  return (
    <div className={styles.bar} role="status" data-testid="held-reports">
      <span className={styles.icon}>
        <Inbox size={16} strokeWidth={1.75} />
      </span>
      <p className={styles.title} title={error ?? label}>
        {error ?? label}
      </p>
      <button
        type="button"
        className={styles.primary}
        disabled={busy}
        title={m.sendTitle}
        onClick={() => {
          setBusy(true)
          void sendHeld(id).then((problem) => {
            setBusy(false)
            setError(problem)
          })
        }}
      >
        {m.send}
      </button>
    </div>
  )
}
