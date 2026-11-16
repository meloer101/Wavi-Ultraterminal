// 定时任务 (PRD F24, Figma 67A′–67C′, 67L′): every task in one dialog over the window — global things never take the
// main area (v1.89). A row: switch · name, its time and what it does · 下次 and the last outcome · 「…」. Clicking a row
// unfolds its last 20 runs, each opening its session or restoring an archived one. The sheet (ScheduleSheet) edits.
import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import { Copy, Ellipsis, Pencil, Play, Trash2, X } from 'lucide-react'
import { agentName } from '@shared/agents'
import { clock, monthDay, nextRun, runLabel, timingLabel, whenLabel, type Schedule, type ScheduleRun } from '@shared/schedule'
import { defineMessages } from '@shared/i18n'
import { useMessages } from '../ui/i18n'
import { restoreArchivedWorktree } from '../archive/actions'
import { openSettings } from '../settings/SettingsDialog'
import { Toggle } from '../settings/controls'
import { useWorkspace } from '../state/workspace'
import { IconButton } from '../ui/IconButton'
import { popupMenu } from '../ui/menu'
import { ScheduleSheet } from './ScheduleSheet'
import { closeSchedules, openSheet, toggleExpanded, useNow, useSchedules } from './store'
import sheet from '../new-session/NewSessionSheet.module.css'
import styles from './SchedulesDialog.module.css'

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

const M = defineMessages({
  zh: {
    sendTo: (title: string) => `发给「${title}」`,
    closedSession: '已关闭的会话',
    removedProject: '已移除的项目',
    openIn: (project: string, agent: string, model: string | undefined, precheck: boolean) =>
      `在 ${project} 开 ${agent}${model ? `（${model}）` : ''}${precheck ? ' · 有前置检查' : ''}`,
    title: '定时任务',
    newTask: '新建定时任务',
    close: '关闭',
    noTasks: '还没有定时任务',
    settings: '设置…',
    runNow: '立即运行',
    edit: '编辑…',
    duplicate: '复制一份',
    delete: '删除',
    pausedFailures: '已暂停：连续 3 次失败',
    off: '已关闭',
    toggle: (name: string) => `${name}：开关`,
    expires: (day: string) => `agent 建的 · ${day} 到期`,
    keep: '保留',
    next: '下次',
    never: '不会再运行',
    todayPrefix: '今天',
    neverRun: '还没运行过',
    more: (name: string) => `${name}：更多`,
    recentRuns: (name: string) => `${name}：最近的运行`,
    today: '今天',
    restore: '恢复',
    open: '打开'
  },
  en: {
    sendTo: (title: string) => `Send to “${title}”`,
    closedSession: 'a closed session',
    removedProject: 'a removed project',
    openIn: (project: string, agent: string, model: string | undefined, precheck: boolean) =>
      `Open ${agent}${model ? ` (${model})` : ''} in ${project}${precheck ? ' · with a pre-check' : ''}`,
    title: 'Scheduled tasks',
    newTask: 'New scheduled task',
    close: 'Close',
    noTasks: 'No scheduled tasks yet',
    settings: 'Settings…',
    runNow: 'Run now',
    edit: 'Edit…',
    duplicate: 'Duplicate',
    delete: 'Delete',
    pausedFailures: 'Paused: 3 failures in a row',
    off: 'Off',
    toggle: (name: string) => `${name}: on/off`,
    expires: (day: string) => `Made by an agent · expires ${day}`,
    keep: 'Keep',
    next: 'Next',
    never: 'Won’t run again',
    todayPrefix: 'today',
    neverRun: 'Hasn’t run yet',
    more: (name: string) => `${name}: more`,
    recentRuns: (name: string) => `${name}: recent runs`,
    today: 'Today',
    restore: 'Restore',
    open: 'Open'
  }
})

export function SchedulesDialog() {
  const open = useSchedules((s) => s.open)
  return open ? (
    <>
      <Dialog />
      <ScheduleSheet />
    </>
  ) : null
}

/** `在 terminal-reborn 开 Codex（gpt-6-sol）` / `发给「Cookie 会话迁移」`. */
function useWhatLabel(schedule: Schedule): string {
  const projects = useWorkspace((s) => s.projects)
  const sessions = useWorkspace((s) => s.sessions)
  const m = useMessages(M)
  const a = schedule.action
  if (a.kind === 'send') return m.sendTo(sessions.find((s) => s.id === a.sessionId)?.title ?? m.closedSession)
  const project = projects.find((p) => p.id === a.projectId)?.name ?? m.removedProject
  return m.openIn(project, agentName(a.agent), a.model, Boolean(a.precheck))
}

/** The outcome's mark: filled for what happened, hollow for a skip, red for a failure; the text says which (never color alone). */
function RunMark({ run }: { run: ScheduleRun | undefined }) {
  const kind = !run ? 'none' : run.outcome === 'failed' ? 'failed' : run.outcome === 'skipped' ? 'skipped' : run.outcome === 'running' ? 'running' : 'done'
  return <span className={styles.mark} data-kind={kind} aria-hidden />
}

function Dialog() {
  const schedules = useSchedules((s) => s.schedules)
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const sheetOpen = useSchedules((s) => s.sheet !== null)
  const m = useMessages(M)
  useEffect(() => ref.current?.focus(), [])

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || sheetOpen) return
    if (event.key === 'Escape') {
      event.preventDefault()
      closeSchedules()
    }
  }
  const onScrimMouseDown = (event: MouseEvent): void => {
    if (event.target === event.currentTarget && !sheetOpen) closeSchedules()
  }

  return (
    <div className={sheet.scrim} onMouseDown={onScrimMouseDown} data-region="schedules">
      <div ref={ref} className={`${sheet.sheet} ${styles.dialog}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown} data-testid="schedules-dialog">
        <header className={styles.header}>
          <h2 id={titleId} className={sheet.title}>
            {m.title}
          </h2>
          <span className={styles.spacer} />
          {schedules.length > 0 && (
            <button type="button" className={styles.button} onClick={() => openSheet({ mode: 'new' })}>
              {m.newTask}
            </button>
          )}
          <IconButton label={m.close} onClick={closeSchedules}>
            <X {...ICON} />
          </IconButton>
        </header>
        {schedules.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{m.noTasks}</p>
            <button type="button" className={sheet.primary} onClick={() => openSheet({ mode: 'new' })}>
              {m.newTask}
            </button>
          </div>
        ) : (
          <div className={styles.list} role="list">
            {schedules.map((s) => (
              <Row key={s.id} schedule={s} />
            ))}
          </div>
        )}
        <footer className={styles.footer}>
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              closeSchedules()
              openSettings('automation')
            }}
          >
            {m.settings}
          </button>
        </footer>
      </div>
    </div>
  )
}

async function rowMenu(schedule: Schedule, anchor: Element, m: (typeof M)['zh']): Promise<void> {
  const choice = await popupMenu(
    [
      { type: 'item', id: 'run', label: m.runNow, icon: Play },
      { type: 'item', id: 'edit', label: m.edit, icon: Pencil },
      { type: 'item', id: 'copy', label: m.duplicate, icon: Copy },
      { type: 'separator' },
      { type: 'item', id: 'delete', label: m.delete, icon: Trash2 }
    ],
    anchor
  )
  if (choice === 'run') await window.tr.schedules.runNow(schedule.id)
  else if (choice === 'edit') openSheet({ mode: 'edit', id: schedule.id })
  else if (choice === 'copy') openSheet({ mode: 'copy', id: schedule.id })
  else if (choice === 'delete') await window.tr.schedules.remove(schedule.id)
}

function Row({ schedule }: { schedule: Schedule }) {
  const expanded = useSchedules((s) => s.expanded === schedule.id)
  const what = useWhatLabel(schedule)
  const m = useMessages(M)
  const now = useNow()
  const next = nextRun(schedule, now)
  const last = schedule.runs[0]
  const state = schedule.paused === 'failures' ? m.pausedFailures : !schedule.enabled ? m.off : null
  return (
    <div className={styles.item} role="listitem" data-testid="schedule-row">
      <div className={styles.row} data-expanded={expanded} data-off={!schedule.enabled} onClick={() => toggleExpanded(schedule.id)}>
        <span className={styles.toggle} onClick={(e) => e.stopPropagation()}>
          <Toggle checked={schedule.enabled} label={m.toggle(schedule.name)} onChange={(on) => void window.tr.schedules.setEnabled(schedule.id, on)} />
        </span>
        <div className={styles.main}>
          <div className={styles.nameLine}>
            <span className={styles.name}>{schedule.name}</span>
            {schedule.expiresAt !== undefined && (
              <>
                <span className={styles.meta}>{m.expires(monthDay(schedule.expiresAt))}</span>
                <button
                  type="button"
                  className={styles.link}
                  onClick={(e) => {
                    e.stopPropagation()
                    void window.tr.schedules.keep(schedule.id)
                  }}
                >
                  {m.keep}
                </button>
              </>
            )}
          </div>
          <span className={styles.sub}>
            {timingLabel(schedule.timing)} · {what}
          </span>
        </div>
        <div className={styles.side}>
          {state ? (
            <span className={styles.state} data-paused={schedule.paused === 'failures'}>
              {schedule.paused === 'failures' && <span className={styles.mark} data-kind="failed" aria-hidden />}
              {state}
            </span>
          ) : (
            <span className={styles.nextLine}>
              <span className={styles.nextLabel}>{m.next}</span>
              <span className={styles.nextTime}>{next !== null ? whenLabel(next, now) : m.never}</span>
            </span>
          )}
          <span className={styles.result}>
            {last ? (
              <>
                <RunMark run={last} />
                <span className={styles.resultText}>
                  {whenLabel(last.at, now).replace(/^(\d)/, `${m.todayPrefix} $1`)} · {runLabel(last)}
                </span>
              </>
            ) : (
              <span className={styles.resultText}>{m.neverRun}</span>
            )}
          </span>
        </div>
        <span className={styles.more} onClick={(e) => e.stopPropagation()}>
          <IconButton label={m.more(schedule.name)} onClick={(e) => void rowMenu(schedule, e.currentTarget, m)}>
            <Ellipsis {...ICON} />
          </IconButton>
        </span>
      </div>
      {expanded && <History schedule={schedule} />}
    </div>
  )
}

function History({ schedule }: { schedule: Schedule }) {
  const sessions = useWorkspace((s) => s.sessions)
  const worktrees = useWorkspace((s) => s.worktrees)
  const today = monthDay(useNow())
  const m = useMessages(M)
  if (schedule.runs.length === 0) return <div className={styles.history}><span className={styles.historyEmpty}>{m.neverRun}</span></div>
  return (
    <div className={styles.history} role="list" aria-label={m.recentRuns(schedule.name)}>
      {schedule.runs.map((run) => {
        const session = run.sessionId ? sessions.find((s) => s.id === run.sessionId) : undefined
        const worktree = session && worktrees.find((w) => w.id === session.worktreeId)
        const archived = worktree?.archived !== undefined
        return (
          <div key={`${run.planned}-${run.manual ? 'm' : 's'}`} className={styles.run} role="listitem">
            <span className={styles.runTime}>
              {monthDay(run.at) === today ? m.today : monthDay(run.at)} {clock(run.at)}
            </span>
            <RunMark run={run} />
            <span className={styles.runText}>{runLabel(run)}</span>
            {session && worktree && (
              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  if (archived) void restoreArchivedWorktree(worktree.id)
                  else {
                    closeSchedules()
                    useWorkspace.getState().setActiveSession(session.id)
                  }
                }}
              >
                {archived ? m.restore : m.open}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
