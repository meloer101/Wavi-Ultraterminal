// 定时任务确认 (PRD F24, Figma 67J′): an agent ran `wavi schedule`. Like 派活确认 (dispatch/DispatchStrip, Figma 40B) it
// sits under that session's terminal and the session shows 等你处理 until the user answers. One row per request:
// name · time · 发给这个会话 / 每次开一个 X 会话 · the message; the footer says when it would expire. ⌘↵ starts.
import { useEffect, useRef } from 'react'
import { Clock } from '../ui/icons'
import { agentName } from '@shared/agents'
import { monthDay, timingLabel } from '@shared/schedule'
import type { SessionId } from '@shared/types'
import { defineMessages } from '@shared/i18n'
import { useSessionView, useWorkspace } from '../state/workspace'
import { useMessages } from '../ui/i18n'
import { decideScheduleRequests, useScheduleRequests, type ScheduleRequest } from './agent-requests'
import styles from '../dispatch/DispatchStrip.module.css'
import own from './ScheduleConfirmStrip.module.css'

const M = defineMessages({
  zh: {
    wants: (n: number) => `想建 ${n} 个定时任务`,
    toThisSession: '发给这个会话',
    newSessionEachTime: (agent: string) => `每次开一个 ${agent} 会话`,
    expires: (day: string) => `agent 建的 · ${day} 到期`,
    decline: '拒绝',
    start: '开始'
  },
  en: {
    wants: (n: number) => (n === 1 ? 'Wants to create 1 scheduled task' : `Wants to create ${n} scheduled tasks`),
    toThisSession: 'To this session',
    newSessionEachTime: (agent: string) => `A new ${agent} session each time`,
    expires: (day: string) => `Made by an agent · expires ${day}`,
    decline: 'Deny',
    start: 'Start'
  }
})

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const
const NONE: ScheduleRequest[] = []

const decide = (sessionId: string, go: boolean): void => {
  const session = useWorkspace.getState().sessions.find((s) => s.id === sessionId)
  void decideScheduleRequests(sessionId, go, session)
}

/** `active`: its pane has the keyboard. */
export function ScheduleConfirmStrip({ sessionId, active }: { sessionId: SessionId; active: boolean }) {
  const id = useSessionView(sessionId)?.session.id ?? null
  const all = useScheduleRequests((s) => s.pending)
  const pending = id ? all.filter((r) => r.sessionId === id) : NONE
  return id && pending.length > 0 ? <Strip sessionId={id} pending={pending} active={active} /> : null
}

function Strip({ sessionId, pending, active }: { sessionId: string; pending: readonly ScheduleRequest[]; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const m = useMessages(M)
  const count = pending.length

  // ⌘↵ from the terminal or the strip, as the dispatch strip takes it.
  useEffect(() => {
    const strip = ref.current
    const win = strip?.ownerDocument.defaultView
    if (!strip || !win) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || !event.metaKey || event.shiftKey || event.altKey || event.ctrlKey) return
      if (event.isComposing || event.repeat || event.defaultPrevented || strip.offsetParent === null) return
      const target = event.target instanceof win.Element ? event.target : null
      // Its own pane only (a split shows a strip under each pane that has one); nothing focused is the active pane's.
      const pane = strip.closest('[data-pane-box]')
      const fromHere = target !== null && (strip.contains(target) || (pane !== null && pane.contains(target)))
      if (!fromHere && !(active && target === strip.ownerDocument.body)) return
      event.preventDefault()
      event.stopPropagation()
      decide(sessionId, true)
    }
    win.addEventListener('keydown', onKeyDown, true)
    return () => win.removeEventListener('keydown', onKeyDown, true)
  }, [sessionId, active])

  return (
    <div ref={ref} className={styles.strip} role="region" aria-label={m.wants(count)} data-testid="schedule-strip">
      <div className={styles.row}>
        <span className={styles.gutter}>
          <Clock {...ICON} />
        </span>
        <span className={styles.title}>{m.wants(count)}</span>
      </div>
      {pending.map(({ callId, draft }) => (
        <div key={callId} className={styles.row}>
          <span className={styles.gutter} />
          <span className={styles.name}>{draft.name}</span>
          <span className={styles.branch}>{timingLabel(draft.timing)}</span>
          <span className={styles.base}>{draft.action.kind === 'send' ? m.toThisSession : m.newSessionEachTime(agentName(draft.action.agent))}</span>
          <span className={styles.task}>{draft.prompt.split('\n').find((l) => l.trim()) ?? ''}</span>
        </div>
      ))}
      <div className={styles.footer}>
        <span className={own.expires}>{m.expires(monthDay(pending[0]!.expiresAt))}</span>
        <button type="button" className={styles.ghost} onClick={() => decide(sessionId, false)}>
          {m.decline}
        </button>
        <button type="button" className={styles.primary} onClick={() => decide(sessionId, true)} data-testid="schedule-start">
          {m.start}
          <span data-shortcut-hint className={styles.shortcut}>⌘↵</span>
        </button>
      </div>
    </div>
  )
}
