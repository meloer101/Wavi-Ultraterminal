// Claude's own `/loop` in this session (PRD F24, Figma 67I′): a mark in the session header, its timers listed on hover.
// Display only — Wavi never changes them; they end with the session. Only Claude reports them (Stop hook
// `session_crons`), so no other agent shows one.
import { RotateCw } from '../ui/icons'
import { cronLabel } from '@shared/agent-events'
import type { SessionId } from '@shared/types'
import { defineMessages } from '@shared/i18n'
import { useSessionMeta } from '../session-meta/store'
import { useMessages } from '../ui/i18n'
import styles from './LoopBadge.module.css'

const M = defineMessages({
  zh: {
    loop: 'Claude 的 /loop',
    count: (n: number) => `${n} 条`,
    once: (when: string) => `一次 · ${when}`
  },
  en: {
    loop: 'Claude’s /loop',
    count: (n: number) => (n === 1 ? '1 timer' : `${n} timers`),
    once: (when: string) => `Once · ${when}`
  }
})

export function LoopBadge({ sessionId }: { sessionId: SessionId }) {
  const crons = useSessionMeta((s) => s.bySession[sessionId]?.crons)
  const m = useMessages(M)
  if (!crons || crons.length === 0) return null
  const first = crons[0]!
  return (
    <span className={styles.badge} tabIndex={0} data-testid="loop-badge">
      <RotateCw size={14} strokeWidth={1.75} aria-hidden />
      <span>
        {cronLabel(first.schedule)} · {m.loop}
        {crons.length > 1 ? ` · ${m.count(crons.length)}` : ''}
      </span>
      <span className={styles.popover} role="tooltip">
        <span className={styles.heading}>
          {m.loop} · {m.count(crons.length)}
        </span>
        {crons.map((c, i) => (
          <span key={`${c.schedule}-${i}`} className={styles.item}>
            <span className={styles.when}>{c.recurring ? cronLabel(c.schedule) : m.once(cronLabel(c.schedule))}</span>
            <span className={styles.prompt}>{c.prompt}</span>
          </span>
        ))}
      </span>
    </span>
  )
}
