// 新建 / 编辑定时任务 (PRD F24, Figma 67D′–67G′): the 新建会话 sheet's rows, menus and controls (new-session/), with the
// task's own: 做什么 · 会话 or 项目 · 基于 · 智能体 · 界面 · 模型 · 权限 · 消息 · 时间 · 错过了 · 自动归档 · 前置检查.
// No explanatory lines: labels, values and the 下次 time carry it (Figma 67′).
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Check, ChevronRight, GitBranch, Globe } from '../ui/icons'
import { AGENT_SPECS, agentName, CLI_AGENTS, type CliAgent } from '@shared/agents'
import { GUI_PERMISSION_LABELS, type GuiPermission } from '@shared/gui-chat'
import { guiPermissionLevels } from '@shared/gui-agents'
import { cliPermissionHasDefault, cliPermissionLevels, cliPlainPermission } from '@shared/agent-launch'
import type { AgentAvailability } from '@shared/ipc'
import { defaultBase, groupBranches, type NewSessionInfo } from '@shared/new-session'
import {
  clock,
  MIN_INTERVAL_MINUTES,
  pad,
  nextOccurrence,
  whenLabel,
  type Schedule,
  type ScheduleAction,
  type ScheduleDraft,
  type ScheduleTiming,
  type Weekday
} from '@shared/schedule'
import type { ProjectId, SessionId, SessionUi } from '@shared/types'
import { defineMessages, pick } from '@shared/i18n'
import { Field, SelectButton } from '../new-session/NewSessionSheet'
import { binaryInstalled, listedAgents, uiRow } from '../new-session/model'
import { SheetMenu, type SheetMenuSection } from '../new-session/SheetMenu'
import { useWorkspace } from '../state/workspace'
import { Segmented } from '../ui/Segmented'
import { StatusGlyph } from '../ui/StatusGlyph'
import { useMessages } from '../ui/i18n'
import { canReceive } from './model'
import { closeSheet, useNow, useSchedules, type SheetState } from './store'
import sheet from '../new-session/NewSessionSheet.module.css'
import styles from './ScheduleSheet.module.css'

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

type What = ScheduleAction['kind']
type TimingKind = ScheduleTiming['kind']
type Permission = GuiPermission | 'default'

const M = defineMessages({
  zh: {
    newTitle: '新建定时任务',
    editTitle: '编辑定时任务',
    name: '名称',
    what: '做什么',
    session: '会话',
    pickSession: '选一个会话',
    project: '项目',
    base: '基于',
    agent: '智能体',
    interface: '界面',
    model: '模型',
    permission: '权限',
    defaultChoice: '默认',
    message: '消息',
    time: '时间',
    every: '每隔',
    interval: '间隔',
    unit: '单位',
    weekdays: '星期',
    date: '日期',
    clockTime: '时刻',
    never: '不会再运行',
    until: '到某天为止',
    untilDate: '截止日期',
    missed: '错过了',
    autoArchive: '自动归档',
    whenUnchanged: '这一轮没有改动时',
    precheck: '前置检查',
    noPrecheck: '没有',
    oneCommand: '一条命令',
    cancel: '取消',
    save: '保存',
    installed: '已安装',
    localBranches: '本地分支',
    remoteBranches: '远程分支',
    projectDefault: '项目默认',
    cannotTellIdle: '看不出空闲',
    noProjects: '没有项目',
    searchBranches: '搜索分支',
    searchAgents: '搜索智能体',
    noMatchingAgents: '没有匹配的智能体',
    noModels: '没有模型',
    searchSessions: '搜索会话',
    noSessions: '没有会话',
    copyName: (name: string) => `${name} 副本`,
    next: (when: string) => `下次 ${when}`
  },
  en: {
    newTitle: 'New scheduled task',
    editTitle: 'Edit scheduled task',
    name: 'Name',
    what: 'Action',
    session: 'Session',
    pickSession: 'Choose a session',
    project: 'Project',
    base: 'Based on',
    agent: 'Agent',
    interface: 'Interface',
    model: 'Model',
    permission: 'Permissions',
    defaultChoice: 'Default',
    message: 'Message',
    time: 'Time',
    every: 'Every',
    interval: 'Interval',
    unit: 'Unit',
    weekdays: 'Days of the week',
    date: 'Date',
    clockTime: 'Time of day',
    never: 'Won’t run again',
    until: 'Until a date',
    untilDate: 'End date',
    missed: 'If missed',
    autoArchive: 'Auto-archive',
    whenUnchanged: 'When the turn changes nothing',
    precheck: 'Pre-check',
    noPrecheck: 'None',
    oneCommand: 'A command',
    cancel: 'Cancel',
    save: 'Save',
    installed: 'Installed',
    localBranches: 'Local branches',
    remoteBranches: 'Remote branches',
    projectDefault: 'Project default',
    cannotTellIdle: 'Can’t tell when it’s idle',
    noProjects: 'No projects',
    searchBranches: 'Search branches',
    searchAgents: 'Search agents',
    noMatchingAgents: 'No matching agents',
    noModels: 'No models',
    searchSessions: 'Search sessions',
    noSessions: 'No sessions',
    copyName: (name: string) => `${name} copy`,
    next: (when: string) => `Next ${when}`
  }
})

const OPTIONS = defineMessages({
  zh: {
    what: { new: '开新会话', send: '发给已有会话' } as Record<What, string>,
    timing: { interval: '间隔', daily: '每天', weekdays: '工作日', weekly: '每周', once: '一次' } as Record<TimingKind, string>,
    missed: { 'catch-up': '补跑一次', skip: '跳过' } as Record<Schedule['missed'], string>,
    unit: { minutes: '分钟', hours: '小时' } as Record<'minutes' | 'hours', string>,
    weekday: { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 0: '日' } as Record<Weekday, string>
  },
  en: {
    what: { new: 'New session', send: 'Existing session' },
    timing: { interval: 'Interval', daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly', once: 'Once' },
    missed: { 'catch-up': 'Run once', skip: 'Skip' },
    unit: { minutes: 'minutes', hours: 'hours' },
    weekday: { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' }
  }
})

const WHATS: readonly What[] = ['new', 'send']
const UIS: ReadonlyArray<{ value: SessionUi; label: string }> = [
  { value: 'gui', label: 'GUI' },
  { value: 'cli', label: 'CLI' }
]
const TIMINGS: readonly TimingKind[] = ['interval', 'daily', 'weekdays', 'weekly', 'once']
const MISSED: ReadonlyArray<Schedule['missed']> = ['catch-up', 'skip']
const UNITS: ReadonlyArray<'minutes' | 'hours'> = ['minutes', 'hours']
/** Monday first, as the Mac's calendar shows a week here. */
const WEEK: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0]
const labelled = <T,>(values: readonly T[], labels: Record<T & PropertyKey, string>): Array<{ value: T; label: string }> =>
  values.map((value) => ({ value, label: labels[value as T & PropertyKey] }))

const dayOf = (t: number): string => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const atDayClock = (day: string, time: string): number | null => {
  const [y, m, d] = day.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  if (!y || !m || !d || h === undefined || min === undefined || Number.isNaN(h) || Number.isNaN(min)) return null
  return new Date(y, m - 1, d, h, min).getTime()
}

/** The form's fields, from the task being edited or copied, or the defaults. */
interface Form {
  name: string
  what: What
  projectId: ProjectId | null
  base: string | null
  agent: CliAgent
  ui: SessionUi
  model: string
  permission: Permission
  autoArchive: boolean
  precheck: string
  sessionId: SessionId | null
  prompt: string
  timing: TimingKind
  every: number
  unit: 'minutes' | 'hours'
  time: string
  days: Weekday[]
  onceDay: string
  hasUntil: boolean
  until: string
  missed: Schedule['missed']
}

function initialForm(source: Schedule | undefined, copy: boolean, projectId: ProjectId | null): Form {
  const now = Date.now()
  const base: Form = {
    name: '',
    what: 'new',
    projectId,
    base: null,
    agent: 'claude',
    ui: 'gui',
    model: '',
    // None chosen: 询问 for a GUI, the CLI's plain launch for a terminal.
    permission: 'default',
    autoArchive: true,
    precheck: '',
    sessionId: null,
    prompt: '',
    timing: 'daily',
    every: 30,
    unit: 'minutes',
    time: '09:00',
    days: [new Date(now).getDay() as Weekday],
    onceDay: dayOf(now + 24 * 60 * 60 * 1000),
    hasUntil: false,
    until: dayOf(now + 30 * 24 * 60 * 60 * 1000),
    missed: 'catch-up'
  }
  if (!source) return base
  const a = source.action
  const t = source.timing
  return {
    ...base,
    name: copy ? pick(M).copyName(source.name).slice(0, 60) : source.name,
    what: a.kind,
    prompt: source.prompt,
    missed: source.missed,
    ...(source.until ? { hasUntil: true, until: source.until } : {}),
    ...(a.kind === 'new'
      ? { projectId: a.projectId, base: a.base, agent: a.agent, ui: a.ui, model: a.model ?? '', permission: a.permission ?? 'default', autoArchive: a.autoArchive, precheck: a.precheck ?? '' }
      : { sessionId: a.sessionId }),
    timing: t.kind,
    ...(t.kind === 'interval' ? (t.minutes % 60 === 0 ? { every: t.minutes / 60, unit: 'hours' as const } : { every: t.minutes, unit: 'minutes' as const }) : {}),
    ...(t.kind === 'daily' || t.kind === 'weekdays' || t.kind === 'weekly' ? { time: t.time } : {}),
    ...(t.kind === 'weekly' ? { days: t.days } : {}),
    ...(t.kind === 'once' ? { onceDay: dayOf(t.at), time: clock(t.at) } : {})
  }
}

function timingOf(form: Form): ScheduleTiming | null {
  switch (form.timing) {
    case 'interval': {
      const minutes = Math.round(form.every * (form.unit === 'hours' ? 60 : 1))
      return Number.isFinite(minutes) && minutes >= MIN_INTERVAL_MINUTES ? { kind: 'interval', minutes } : null
    }
    case 'daily':
    case 'weekdays':
      return { kind: form.timing, time: form.time }
    case 'weekly':
      return form.days.length > 0 ? { kind: 'weekly', days: [...form.days].sort(), time: form.time } : null
    case 'once': {
      const at = atDayClock(form.onceDay, form.time)
      return at !== null ? { kind: 'once', at } : null
    }
  }
}

/** Only Claude's terminal takes a 权限 at launch; every GUI session does (PRD F24). */
/** PRD F24 v1.205: the levels the agent offers — its GUI's, or what its CLI can be launched with (默认 first when none is its plain launch). */
const permissionsFor = (agent: CliAgent, ui: SessionUi): readonly Permission[] =>
  ui === 'gui' ? guiPermissionLevels(agent) : [...(cliPermissionHasDefault(agent) ? (['default'] as const) : []), ...cliPermissionLevels(agent)]

export function ScheduleSheet() {
  const state = useSchedules((s) => s.sheet)
  return state ? <Sheet key={JSON.stringify(state)} state={state} /> : null
}

function Sheet({ state }: { state: SheetState }) {
  const schedules = useSchedules((s) => s.schedules)
  const source = state.mode === 'new' ? undefined : schedules.find((s) => s.id === state.id)
  const projects = useWorkspace((s) => s.projects)
  const sessions = useWorkspace((s) => s.sessions)
  const worktrees = useWorkspace((s) => s.worktrees)
  const guiPicks = useWorkspace((s) => s.guiPicks)
  const [form, setForm] = useState<Form>(() => initialForm(source, state.mode === 'copy', projects[0]?.id ?? null))
  const set = <K extends keyof Form>(key: K, value: Form[K]): void => setForm((f) => ({ ...f, [key]: value }))
  const [precheckOpen, setPrecheckOpen] = useState(form.precheck !== '')
  const [found, setFound] = useState<AgentAvailability | null>(null)
  const [infos, setInfos] = useState<Record<ProjectId, NewSessionInfo | 'error'>>({})
  const [menu, setMenu] = useState<{ kind: 'project' | 'base' | 'agent' | 'model' | 'session'; anchor: HTMLElement } | null>(null)
  const [saving, setSaving] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const m = useMessages(M)
  const o = useMessages(OPTIONS)
  const project = projects.find((p) => p.id === form.projectId) ?? null
  const loaded = project ? infos[project.id] : undefined
  const info = loaded && loaded !== 'error' ? loaded : null

  useEffect(() => sheetRef.current?.focus(), [])
  useEffect(() => {
    let cancelled = false
    void window.tr.app.detectAgents().then((next) => !cancelled && setFound(next)).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  useEffect(() => {
    if (!project || infos[project.id]) return
    let cancelled = false
    window.tr.gitWorktrees
      .newSessionInfo(project.rootPath)
      .then((next) => !cancelled && setInfos((all) => ({ ...all, [project.id]: next })))
      .catch(() => !cancelled && setInfos((all) => ({ ...all, [project.id]: 'error' })))
    return () => {
      cancelled = true
    }
  }, [project, infos])

  // The 模型 menu lists what the agent offered last; nothing yet asks it once, as the phone's 新建会话 does.
  useEffect(() => {
    if (guiPicks[form.agent]?.models?.length) return
    let cancelled = false
    void window.tr.gui
      .models(form.agent)
      .then((result) => {
        if (cancelled || !result.ok || useWorkspace.getState().guiPicks[form.agent]?.modelsFrom === 'live') return
        useWorkspace.getState().rememberGuiPicks(form.agent, { models: result.catalog.models, modelsFrom: 'probe' })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [form.agent, guiPicks])

  const ui = uiRow(form.agent, form.ui, binaryInstalled(found))
  const sessionUi: SessionUi = ui?.value ?? 'cli'
  const permissions = permissionsFor(form.agent, sessionUi)
  // No 权限 saved (or one the agent lacks): what it runs without one — the CLI's plain launch, a GUI's first level.
  const plain = sessionUi === 'cli' ? cliPlainPermission(form.agent) : undefined
  const permission: Permission = permissions.includes(form.permission) ? form.permission : (plain ?? permissions[0] ?? 'default')
  const base = form.base ?? (info ? defaultBase(info) : null)
  const agentModels = guiPicks[form.agent]?.models
  const models = useMemo(() => agentModels ?? [], [agentModels])
  const now = useNow()
  const timing = timingOf(form)
  const until = form.hasUntil && form.timing !== 'once' ? form.until : undefined
  const next = timing ? nextOccurrence(timing, now, now, until) : null
  const target = sessions.find((s) => s.id === form.sessionId)

  const action: ScheduleAction | null =
    form.what === 'send'
      ? target && canReceive(target)
        ? { kind: 'send', sessionId: target.id }
        : null
      : project && base
        ? {
            kind: 'new',
            projectId: project.id,
            base,
            agent: form.agent,
            ui: sessionUi,
            autoArchive: form.autoArchive,
            ...(form.model ? { model: form.model } : {}),
            ...(permission !== 'default' ? { permission } : {}),
            ...(form.precheck.trim() ? { precheck: form.precheck.trim() } : {})
          }
        : null
  const draft: ScheduleDraft | null =
    action && timing && form.name.trim() && form.prompt.trim()
      ? { name: form.name.trim(), enabled: source?.enabled ?? true, action, prompt: form.prompt, timing, missed: form.missed, ...(until ? { until } : {}) }
      : null

  const save = async (): Promise<void> => {
    if (!draft || saving) return
    setSaving(true)
    const saved = state.mode === 'edit' ? await window.tr.schedules.update(state.id, { ...draft, enabled: source?.enabled ?? true }) : await window.tr.schedules.create({ ...draft, enabled: true })
    setSaving(false)
    if (saved) closeSheet()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      closeSheet()
    } else if (event.key === 'Enter' && event.metaKey) {
      event.preventDefault()
      void save()
    }
  }
  const onScrimMouseDown = (event: MouseEvent): void => {
    if (event.target === event.currentTarget) closeSheet()
  }
  const closeMenu = useCallback((refocus: boolean) => {
    setMenu((open) => {
      if (refocus) open?.anchor.focus()
      return null
    })
  }, [])
  const toggleMenu = (kind: NonNullable<typeof menu>['kind'], anchor: HTMLElement): void => setMenu(menu?.kind === kind ? null : { kind, anchor })
  const check = (on: boolean) => (on ? <Check {...ICON} /> : null)

  const projectSections = useCallback((): SheetMenuSection[] => [{ items: projects.map((p) => ({ value: p.id, label: p.name, icon: check(p.id === form.projectId) })) }], [projects, form.projectId])
  const agentSections = useCallback(
    (query: string): SheetMenuSection[] => {
      const q = query.trim().toLowerCase()
      const items = listedAgents(found)
        .filter((id): id is CliAgent => id !== 'shell' && (!found || found[id] === true))
        .filter((id) => !q || agentName(id).toLowerCase().includes(q) || AGENT_SPECS[id].binary.includes(q))
        .map((id) => ({ value: id, label: agentName(id), icon: check(id === form.agent) }))
      return [{ title: m.installed, items }]
    },
    [found, form.agent, m]
  )
  const branchSections = useCallback(
    (query: string): SheetMenuSection[] => {
      if (!info) return []
      const groups = groupBranches(info.branches, info.defaultBranch, query)
      return [
        { title: m.localBranches, items: groups.local.map((b) => ({ value: b.name, label: b.name, icon: b.name === base ? <Check {...ICON} /> : <GitBranch {...ICON} />, meta: b.name === info.defaultBranch ? m.projectDefault : undefined })) },
        { title: m.remoteBranches, items: groups.remote.map((b) => ({ value: b.name, label: b.name, icon: b.name === base ? <Check {...ICON} /> : <Globe {...ICON} /> })) }
      ]
    },
    [info, base, m]
  )
  const modelSections = useCallback(
    (): SheetMenuSection[] => [{ items: [{ value: '', label: m.defaultChoice, icon: check(form.model === '') }, ...models.map((x) => ({ value: x.value, label: x.label, icon: check(x.value === form.model) }))] }],
    [models, form.model, m]
  )
  const sessionSections = useCallback(
    (query: string): SheetMenuSection[] => {
      const q = query.trim().toLowerCase()
      return projects
        .map((p) => ({
          title: p.name,
          items: sessions
            .filter((s) => s.kind !== 'shell' && worktrees.some((w) => w.id === s.worktreeId && w.projectId === p.id && w.archived === undefined))
            .filter((s) => !q || s.title.toLowerCase().includes(q))
            .map((s) => ({
              value: s.id,
              label: s.title,
              icon: <StatusGlyph status={s.status} />,
              meta: canReceive(s) ? agentName(s.kind) : m.cannotTellIdle
            }))
        }))
        .filter((section) => section.items.length > 0)
    },
    [projects, sessions, worktrees, m]
  )
  const modelLabel = useMemo(() => (form.model ? (models.find((x) => x.value === form.model)?.label ?? form.model) : m.defaultChoice), [form.model, models, m])
  const timeInput = <input className={styles.time} type="time" aria-label={m.clockTime} value={form.time} onChange={(e) => e.currentTarget.value && set('time', e.currentTarget.value)} />

  return (
    <div className={sheet.scrim} onMouseDown={onScrimMouseDown} data-region="schedule-sheet">
      <div ref={sheetRef} className={`${sheet.sheet} ${styles.sheet}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown} data-testid="schedule-sheet">
        <header className={sheet.context}>
          <h2 id={titleId} className={sheet.title}>
            {state.mode === 'edit' ? m.editTitle : m.newTitle}
          </h2>
        </header>

        <div className={`${sheet.fields} ${styles.fields}`}>
          <Field label={m.name}>
            <input className={styles.text} aria-label={m.name} value={form.name} maxLength={60} onChange={(e) => set('name', e.currentTarget.value)} autoFocus={state.mode === 'new'} />
          </Field>
          <Field label={m.what}>
            <Segmented label={m.what} value={form.what} options={labelled(WHATS, o.what)} onChange={(v) => set('what', v)} />
          </Field>

          {form.what === 'send' ? (
            <Field label={m.session}>
              <SelectButton
                label={m.session}
                value={target ? `${target.title} · ${projects.find((p) => worktrees.some((w) => w.id === target.worktreeId && w.projectId === p.id))?.name ?? ''} · ${agentName(target.kind)}` : m.pickSession}
                expanded={menu?.kind === 'session'}
                onClick={(anchor) => toggleMenu('session', anchor)}
              />
            </Field>
          ) : (
            <>
              <Field label={m.project}>
                <SelectButton label={m.project} value={project?.name ?? '—'} expanded={menu?.kind === 'project'} onClick={(anchor) => toggleMenu('project', anchor)} />
              </Field>
              <Field label={m.base}>
                <SelectButton label={m.base} value={base ?? '—'} expanded={menu?.kind === 'base'} disabled={!info} onClick={(anchor) => toggleMenu('base', anchor)} />
              </Field>
              <Field label={m.agent}>
                <SelectButton label={m.agent} value={agentName(form.agent)} expanded={menu?.kind === 'agent'} onClick={(anchor) => toggleMenu('agent', anchor)} />
              </Field>
              {ui && (
                <Field label={m.interface}>
                  <Segmented label={m.interface} value={ui.value} options={UIS.map((o) => (o.value === 'gui' ? { ...o, disabled: ui.guiDisabled, title: ui.guiTitle } : o))} onChange={(v) => set('ui', v)} />
                </Field>
              )}
              <Field label={m.model}>
                <SelectButton label={m.model} value={modelLabel} expanded={menu?.kind === 'model'} onClick={(anchor) => toggleMenu('model', anchor)} />
              </Field>
              <Field label={m.permission}>
                <Segmented
                  label={m.permission}
                  value={permission}
                  options={permissions.map((p) => ({ value: p, label: p === 'default' ? m.defaultChoice : GUI_PERMISSION_LABELS[p] }))}
                  onChange={(v) => set('permission', v)}
                />
              </Field>
            </>
          )}

          <Field label={m.message}>
            <textarea className={styles.prompt} aria-label={m.message} value={form.prompt} rows={3} onChange={(e) => set('prompt', e.currentTarget.value)} />
          </Field>

          <Field label={m.time}>
            <Segmented label={m.time} value={form.timing} options={labelled(TIMINGS, o.timing)} onChange={(v) => set('timing', v)} />
            <div className={styles.line}>
              {form.timing === 'interval' && (
                <>
                  <span className={styles.word}>{m.every}</span>
                  <input
                    className={styles.number}
                    type="number"
                    aria-label={m.interval}
                    min={form.unit === 'hours' ? 1 : MIN_INTERVAL_MINUTES}
                    value={form.every}
                    onChange={(e) => set('every', Number(e.currentTarget.value))}
                  />
                  <Segmented label={m.unit} value={form.unit} options={labelled(UNITS, o.unit)} onChange={(v) => set('unit', v)} />
                </>
              )}
              {form.timing === 'weekly' && (
                <div className={styles.days} role="group" aria-label={m.weekdays}>
                  {WEEK.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={styles.day}
                      aria-pressed={form.days.includes(d)}
                      onClick={() => set('days', form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d])}
                    >
                      {o.weekday[d]}
                    </button>
                  ))}
                </div>
              )}
              {form.timing === 'once' && <input className={styles.date} type="date" aria-label={m.date} value={form.onceDay} onChange={(e) => e.currentTarget.value && set('onceDay', e.currentTarget.value)} />}
              {form.timing !== 'interval' && timeInput}
              <span className={styles.next}>{next !== null ? m.next(whenLabel(next, now)) : m.never}</span>
            </div>
            {form.timing !== 'once' && (
              <div className={styles.line}>
                <label className={styles.check}>
                  <input type="checkbox" checked={form.hasUntil} onChange={(e) => set('hasUntil', e.currentTarget.checked)} />
                  {m.until}
                </label>
                {form.hasUntil && <input className={styles.date} type="date" aria-label={m.untilDate} value={form.until} onChange={(e) => e.currentTarget.value && set('until', e.currentTarget.value)} />}
              </div>
            )}
          </Field>

          <Field label={m.missed}>
            <Segmented label={m.missed} value={form.missed} options={labelled(MISSED, o.missed)} onChange={(v) => set('missed', v)} />
          </Field>

          {form.what === 'new' && (
            <>
              <Field label={m.autoArchive}>
                <label className={`${styles.check} ${styles.checkRow}`}>
                  <input type="checkbox" checked={form.autoArchive} onChange={(e) => set('autoArchive', e.currentTarget.checked)} />
                  {m.whenUnchanged}
                </label>
              </Field>
              {precheckOpen ? (
                <Field label={m.precheck}>
                  <input className={styles.mono} aria-label={m.precheck} value={form.precheck} spellCheck={false} placeholder={m.oneCommand} onChange={(e) => set('precheck', e.currentTarget.value)} />
                </Field>
              ) : (
                <button type="button" className={sheet.advanced} aria-expanded={false} onClick={() => setPrecheckOpen(true)}>
                  <span className={sheet.label}>{m.precheck}</span>
                  <span className={sheet.advancedBranch}>{m.noPrecheck}</span>
                  <span className={sheet.spacer} />
                  <ChevronRight {...ICON} />
                </button>
              )}
            </>
          )}
        </div>

        <footer className={sheet.footer}>
          <button type="button" className={sheet.cancel} onClick={() => closeSheet()}>
            {m.cancel}
          </button>
          <button type="button" className={sheet.primary} disabled={!draft || saving} onClick={() => void save()}>
            {m.save}
            <span data-shortcut-hint className={sheet.shortcut}>⌘↵</span>
          </button>
        </footer>
      </div>

      {menu?.kind === 'project' && (
        <SheetMenu
          anchor={menu.anchor}
          label={m.project}
          sections={projectSections}
          selected={form.projectId}
          empty={m.noProjects}
          onPick={(id) => {
            setForm((f) => ({ ...f, projectId: id, base: null }))
            closeMenu(true)
          }}
          onClose={closeMenu}
        />
      )}
      {menu?.kind === 'base' && (
        <SheetMenu
          anchor={menu.anchor}
          label={m.base}
          sections={branchSections}
          selected={base}
          search={m.searchBranches}
          onPick={(name) => {
            set('base', name)
            closeMenu(true)
          }}
          onClose={closeMenu}
        />
      )}
      {menu?.kind === 'agent' && (
        <SheetMenu
          anchor={menu.anchor}
          label={m.agent}
          sections={agentSections}
          selected={form.agent}
          search={m.searchAgents}
          empty={m.noMatchingAgents}
          align="selected"
          onPick={(value) => {
            if ((CLI_AGENTS as readonly string[]).includes(value)) setForm((f) => ({ ...f, agent: value as CliAgent, model: '' }))
            closeMenu(true)
          }}
          onClose={closeMenu}
        />
      )}
      {menu?.kind === 'model' && (
        <SheetMenu
          anchor={menu.anchor}
          label={m.model}
          sections={modelSections}
          selected={form.model}
          empty={m.noModels}
          onPick={(value) => {
            set('model', value)
            closeMenu(true)
          }}
          onClose={closeMenu}
        />
      )}
      {menu?.kind === 'session' && (
        <SheetMenu
          anchor={menu.anchor}
          label={m.session}
          sections={sessionSections}
          selected={form.sessionId}
          search={m.searchSessions}
          empty={m.noSessions}
          onPick={(id) => {
            const picked = sessions.find((s) => s.id === id)
            if (!picked || !canReceive(picked)) return
            set('sessionId', id)
            closeMenu(true)
          }}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}

