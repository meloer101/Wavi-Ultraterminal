// A Claude workflow run in a GUI chat (ultracode, PRD F25, Figma 74A–C), drawn at its Workflow call. Before it runs
// the card is the ask: the phases its script declares, 拒绝 / 运行 (74A). While it runs: counts by state, tokens, time
// and 停止; a row per phase (done / all, time) and the running phase's agents under it (74B). Once it ends: the phases,
// the failed agents with their error, a failed run's error, where a stopped run stopped (74C).
import { useEffect, useState } from 'react'
import { Workflow } from '../ui/icons'
import { defineMessages } from '@shared/i18n'
import { claudeModelLabel } from '@shared/terminal-settings'
import type { SessionStatus } from '@shared/types'
import {
  currentPhase,
  isLiveRun,
  phaseViews,
  runOutcome,
  tokenLabel,
  workflowCounts,
  type WorkflowAgent,
  type WorkflowPhase,
  type WorkflowPhaseView,
  type WorkflowRun
} from '@shared/workflow-run'
import { StatusGlyph } from '../ui/StatusGlyph'
import { elapsedLabel } from './model'
import { useMessages } from '../ui/i18n'
import styles from './WorkflowCard.module.css'

const M = defineMessages({
  zh: {
    outcome: { running: '运行中', paused: '已暂停', completed: '已完成', 'partly-failed': '有失败', failed: '失败', stopped: '已停止' },
    errored: (count: number) => `${count} 个出错`,
    runningQueued: '运行中 / 排队',
    done: '完成',
    stop: '停止',
    paused: '等额度恢复后接着跑',
    queued: '排队',
    confirm: '等你确认',
    deny: '拒绝',
    run: '运行'
  },
  en: {
    outcome: { running: 'Running', paused: 'Paused', completed: 'Done', 'partly-failed': 'Some failed', failed: 'Failed', stopped: 'Stopped' },
    errored: (count: number) => `${count} failed`,
    runningQueued: 'Running / queued',
    done: 'Done',
    stop: 'Stop',
    paused: 'Continues once usage resets',
    queued: 'Queued',
    confirm: 'Needs you',
    deny: 'Deny',
    run: 'Run'
  }
})

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

/** The run card's glyph for a phase or agent state: the same shapes as a session's (status is never colour only). */
const GLYPH: Readonly<Record<WorkflowPhaseView['state'] | WorkflowAgent['state'], SessionStatus>> = {
  pending: 'idle',
  queued: 'idle',
  running: 'running',
  paused: 'idle',
  done: 'done_unread',
  error: 'error',
  stopped: 'exited'
}

const OUTCOME: Readonly<Record<ReturnType<typeof runOutcome>, { glyph: SessionStatus }>> = {
  running: { glyph: 'running' },
  paused: { glyph: 'idle' },
  completed: { glyph: 'done_unread' },
  'partly-failed': { glyph: 'error' },
  failed: { glyph: 'error' },
  stopped: { glyph: 'exited' }
}

/** Now, every second while `live` (the elapsed times count up). */
function useNow(live: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [live])
  return now
}

export interface WorkflowAsk {
  /** The prompt's id: a new ask is another card. */
  id: string
  name: string
  phases: WorkflowPhase[]
  /** An answer is on its way: the buttons wait. */
  pending: boolean
  answer(allow: boolean): void
}

export function WorkflowCard({ run, ask, onStop }: { run?: WorkflowRun; ask?: WorkflowAsk; onStop?: (run: WorkflowRun) => void }) {
  const m = useMessages(M)
  const live = run ? isLiveRun(run) : false
  const now = useNow(live)
  if (!run) return ask ? <AskCard ask={ask} /> : null
  const views = phaseViews(run, now)
  const outcome = runOutcome(run)
  const counts = workflowCounts(run)
  const current = live ? currentPhase(views) : undefined
  const elapsed = run.ms ?? (run.startedAt !== undefined ? now - run.startedAt : undefined)
  return (
    <section className={styles.card} data-testid="gui-workflow" data-outcome={outcome}>
      <header className={styles.head}>
        <Workflow {...ICON} className={styles.mark} />
        <span className={styles.name}>{run.name}</span>
        {!live || outcome === 'paused' ? (
          <span className={styles.status} data-outcome={outcome}>
            <StatusGlyph status={OUTCOME[outcome].glyph} />
            {outcome === 'partly-failed' ? m.errored(counts.failed) : m.outcome[outcome]}
          </span>
        ) : null}
        <span className={styles.spacer} />
        {live && (
          <>
            {counts.running + counts.queued > 0 && (
              <span className={styles.count} title={m.runningQueued}>
                <StatusGlyph status="running" />
                {counts.running}
              </span>
            )}
            <span className={styles.count} title={m.done}>
              <StatusGlyph status="done_unread" />
              {counts.done}
            </span>
          </>
        )}
        {run.tokens !== undefined && <span className={styles.mono}>{tokenLabel(run.tokens)} tokens</span>}
        {elapsed !== undefined && <span className={styles.time}>{elapsedLabel(elapsed)}</span>}
        {live && onStop && run.taskId && (
          <button type="button" className={styles.button} onClick={() => onStop(run)}>
            {m.stop}
          </button>
        )}
      </header>
      {run.status === 'failed' && run.error && <p className={styles.error}>{run.error}</p>}
      {outcome === 'paused' && <p className={styles.reason}>{m.paused}</p>}
      <ol className={styles.phases}>
        {views.map((phase, index) => (
          <li key={index}>
            <div className={styles.row}>
              <StatusGlyph status={GLYPH[phase.state]} />
              <span className={phase.state === 'pending' ? styles.phaseIdle : styles.phase}>{phase.title}</span>
              <span className={styles.spacer} />
              <span className={styles.mono}>{phase.total > 0 ? `${phase.done} / ${phase.total}` : '—'}</span>
              <span className={styles.time}>{phase.ms !== undefined ? elapsedLabel(phase.ms) : ''}</span>
            </div>
            {/* The phase that runs lists its agents; once ended only the failed ones stay (Figma 74B / 74C). */}
            <Agents agents={run.agents.filter((a) => a.phase === index && (phase === current || a.state === 'error'))} now={now} live={live} />
          </li>
        ))}
      </ol>
    </section>
  )
}

function Agents({ agents, now, live }: { agents: WorkflowAgent[]; now: number; live: boolean }) {
  const m = useMessages(M)
  if (agents.length === 0) return null
  return (
    <ul className={styles.agents}>
      {agents.map((agent, i) => (
        <li key={agent.id ?? `q${i}`} className={styles.row}>
          <StatusGlyph status={GLYPH[agent.state]} />
          <span className={agent.state === 'queued' ? styles.agentIdle : styles.agent}>{agent.label}</span>
          <span className={styles.spacer} />
          {agent.error ? (
            <span className={styles.agentError} title={agent.error}>
              {agent.error}
            </span>
          ) : (
            agent.model && <span className={styles.mono}>{claudeModelLabel(agent.model)}</span>
          )}
          <span className={styles.time}>
            {agent.state === 'queued' ? m.queued : agent.ms !== undefined ? elapsedLabel(agent.ms) : agent.startedAt !== undefined && live ? elapsedLabel(now - agent.startedAt) : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Figma 74A: the run before it runs — what its script declares, and the two answers. */
function AskCard({ ask }: { ask: WorkflowAsk }) {
  const m = useMessages(M)
  return (
    <section className={styles.card} data-testid="gui-workflow-ask">
      <header className={styles.head}>
        <Workflow {...ICON} className={styles.mark} />
        <span className={styles.name}>{ask.name}</span>
        <span className={styles.status} data-outcome="ask">
          <StatusGlyph status="needs_you" />
          {m.confirm}
        </span>
      </header>
      {ask.phases.length > 0 && (
        <ol className={styles.phases}>
          {ask.phases.map((phase, index) => (
            <li key={index} className={styles.row}>
              <span className={styles.index}>{index + 1}</span>
              <span className={styles.phase}>{phase.title}</span>
              {phase.detail && <span className={styles.detail}>{phase.detail}</span>}
            </li>
          ))}
        </ol>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.button} disabled={ask.pending} onClick={() => ask.answer(false)}>
          {m.deny}
        </button>
        <button type="button" className={styles.primary} disabled={ask.pending} onClick={() => ask.answer(true)}>
          {m.run}
        </button>
      </div>
    </section>
  )
}
