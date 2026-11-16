// 派活确认 (PRD F21, Figma 40B): an agent in a terminal session ran `wavi run`. The request belongs to its session, like a permission
// dialog: the session shows 等你处理 (status/bridge.ts) and this strip sits under its terminal, never over the window,
// so the other sessions stay usable. Every request of that session waiting at once is one row here — agent, name, the
// branch it gets (or 当前改动的快照), its task (a click shows all of it) — then 拒绝 / 开始. ⌘↵ starts while the strip
// is shown; Esc stays the terminal's (it interrupts the agent). 拒绝 tells the agent not to retry.
// A leader's `wavi adopt` (PRD F21 v1.198, Figma 81A) is a row of the same strip: the adopted session's agent,
// 接管 <its name>, its own branch and the task; the head counts them apart (想开 N 个会话 · 接管 M 个).
import { useEffect, useRef, useState } from 'react'
import { ChevronRight, CircleAlert, Split } from 'lucide-react'
import { agentLabel, confirmHead, pendingShown } from '@shared/dispatch'
import { defineMessages } from '@shared/i18n'
import type { SessionId } from '@shared/types'
import { useSessionView } from '../state/workspace'
import { AgentIcon } from '../ui/AgentIcon'
import { decideConfirms } from './handler'
import { useDispatch, type PendingStart } from './store'
import { useMessages } from '../ui/i18n'
import styles from './DispatchStrip.module.css'

const M = defineMessages({
  zh: {
    basedOn: '基于',
    uncommitted: '未提交的改动不会带到新的 worktree 里',
    snapshot: '当前改动的快照',
    adopt: (title: string) => `接管 ${title}`,
    deny: '拒绝',
    start: (count: number) => `开始 ${count} 个`
  },
  en: {
    basedOn: 'Based on',
    uncommitted: 'Uncommitted changes won’t be carried into the new worktree',
    snapshot: 'Snapshot of current changes',
    adopt: (title: string) => `Take over ${title}`,
    deny: 'Deny',
    start: (count: number) => `Start ${count}`
  }
})

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const
const NONE: PendingStart[] = []

/** `active`: its pane has the keyboard. */
export function DispatchStrip({ sessionId, active }: { sessionId: SessionId; active: boolean }) {
  const session = useSessionView(sessionId)?.session
  // A GUI dispatcher answers in its chat: the fan-out graph where `wavi run` was called is the confirm (Figma 68′).
  const id = session && session.ui !== 'gui' ? session.id : null
  const confirms = useDispatch((s) => s.confirms)
  const pending = id ? confirms.filter((c) => c.parentId === id) : NONE
  return id && pending.length > 0 ? <Strip parentId={id} pending={pending} active={active} /> : null
}

function Strip({ parentId, pending, active }: { parentId: string; pending: readonly PendingStart[]; active: boolean }) {
  const m = useMessages(M)
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<string | null>(null)
  const count = pending.length
  const runs = pending.flatMap((c) => (c.kind === 'start' ? [c] : []))
  const head = confirmHead(runs.length, count - runs.length)
  // 基于 is where new sessions start; an adopted one keeps its own branch.
  const base = runs[0]?.base
  const uncommitted = runs.some((c) => c.uncommitted && c.plan.item.base === 'head')

  // ⌘↵ from the terminal or the strip itself, while the strip is on screen. Not from a sheet, the overview or any other
  // field with a ⌘↵ of its own: starting sessions is not undone by pressing it in the wrong place. No key repeat.
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
      decideConfirms(parentId, true)
    }
    win.addEventListener('keydown', onKeyDown, true)
    return () => win.removeEventListener('keydown', onKeyDown, true)
  }, [parentId, active])

  return (
    <div ref={ref} className={styles.strip} role="region" aria-label={head} data-testid="dispatch-strip">
      <div className={styles.row}>
        <span className={styles.gutter}>
          <Split {...ICON} />
        </span>
        <span className={styles.title}>{head}</span>
        {base !== undefined && (
          <span className={styles.base}>
            {m.basedOn} {base}
          </span>
        )}
      </div>
      {uncommitted && (
        <div className={styles.row}>
          <span className={styles.gutter}>
            <CircleAlert {...ICON} />
          </span>
          <span className={styles.note}>{m.uncommitted}</span>
        </div>
      )}
      {pending.map((c) => {
        const { callId } = c
        const { agent, title, task, branch, model } = pendingShown(c)
        const adopt = c.kind === 'adopt'
        const expanded = open === callId
        const firstLine = task.split('\n').find((l) => l.trim() !== '') ?? ''
        return (
          <div key={callId} data-testid="dispatch-row">
            <button type="button" className={styles.row} data-expanded={expanded} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : callId)}>
              <span className={styles.gutter} title={agentLabel(agent)} data-agent={agent}>
                <AgentIcon kind={agent} size={12} />
              </span>
              <span className={styles.name}>{adopt ? m.adopt(title) : title}</span>
              <span className={styles.branch}>{adopt ? branch : branch || m.snapshot}</span>
              <span className={styles.task}>{model ? `${model} · ${firstLine}` : firstLine}</span>
              <span className={styles.chevron}>
                <ChevronRight {...ICON} />
              </span>
            </button>
            {expanded && <pre className={styles.taskBody}>{task}</pre>}
          </div>
        )
      })}
      <div className={styles.footer}>
        <button type="button" className={styles.ghost} onClick={() => decideConfirms(parentId, false)}>
          {m.deny}
        </button>
        <button type="button" className={styles.primary} onClick={() => decideConfirms(parentId, true)} data-testid="dispatch-start">
          {m.start(count)}
          <span className={styles.shortcut}>⌘↵</span>
        </button>
      </div>
    </div>
  )
}
