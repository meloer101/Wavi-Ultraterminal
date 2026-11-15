// “这一轮跑过哪些检查” (PRD F9 / F4): the tests, lint, typecheck and builds an agent ran since the user's last prompt,
// and how each came out — so “做完了” can be checked against what actually passed. Pure; main keeps one TurnChecks per
// session from its hooks (./check-commands.ts reads each Bash call) and sends it to the renderer, which only shows it.
import { defineMessages, localized, pick } from './i18n'

export type CheckKind = 'test' | 'lint' | 'typecheck' | 'build'

/** `unknown`: it ran, but neither an exit code nor the runner's summary says how it ended. */
export type CheckOutcome = 'pass' | 'fail' | 'unknown'

export interface CheckRun {
  kind: CheckKind
  /** The command as run (one simple command, no env or redirections, ≤ 120 chars); with `kind`, the check's identity. */
  command: string
  outcome: CheckOutcome
  /** Where the outcome came from: the exit code, the runner's summary line (no exit code: Codex, a pipe), or nothing. */
  basis: 'exit' | 'output' | 'none'
  /** Not narrowed to some files or tests: a full run that passes settles earlier failures of its kind. */
  full: boolean
  /** Epoch ms of the PostToolUse. */
  at: number
}

/** One turn's record: what ran and whether the agent changed files. */
export interface TurnRecord {
  /** Epoch ms of the UserPromptSubmit that began the turn (0: before the first one Wavi saw). */
  since: number
  /** The agent edited files (Edit / Write / MultiEdit / NotebookEdit, Codex apply_patch). Bash edits are not seen. */
  edited: boolean
  /** Latest run of each distinct check, oldest first. */
  runs: CheckRun[]
}

export interface TurnChecks extends TurnRecord {
  /** Kinds this session ran in earlier turns: the ones this turn not running is worth saying (“类型 未跑”). */
  known: CheckKind[]
  /**
   * The last turn that edited or checked, while this one has done neither (“提交一下”, a question): its results still
   * describe the code, so they are shown as 上一轮.
   */
  previous?: TurnRecord
}

export const KIND_ORDER: readonly CheckKind[] = ['test', 'lint', 'typecheck', 'build']
/** Kinds that “未跑” is said for; a build is not expected every turn. */
const EXPECTED: ReadonlySet<CheckKind> = new Set<CheckKind>(['test', 'lint', 'typecheck'])
/** Keeps a runaway turn (a loop of one-file test runs) from flooding IPC. */
export const MAX_RUNS = 24

export const KIND_LABEL: Record<CheckKind, string> = localized(
  defineMessages<Record<CheckKind, string>>({
    zh: { test: '测试', lint: 'lint', typecheck: '类型', build: '构建' },
    en: { test: 'Tests', lint: 'Lint', typecheck: 'Types', build: 'Build' }
  })
)

const M = defineMessages({
  zh: {
    /** In a sentence: “类型检查没过”. */
    kindName: { test: '测试', lint: 'lint', typecheck: '类型检查', build: '构建' } as Record<CheckKind, string>,
    mark: { pass: '✓', fail: '✗', unknown: '?', 'not-run': '未跑' } as Record<KindStatus, string>,
    said: { pass: '通过', fail: '没过', unknown: '结果不明', 'not-run': '没跑' } as Record<KindStatus, string>,
    noChecks: '没跑检查',
    current: '这一轮',
    previous: '上一轮',
    currentStart: '这一轮',
    previousStart: '上一轮',
    editedNoChecks: (when: string) => `${when}改了文件，没跑检查`,
    description: (when: string, items: string[]) => `${when}：${items.join('，')}`,
    kindSaid: (name: string, said: string) => `${name}${said}`,
    namesSep: '、',
    agentEditedNoChecks: (agent: string, when: string) => `${agent} ${when}改了文件，没跑检查`,
    agentFailed: (agent: string, when: string, names: string) => `${agent} ${when}的${names}没过`,
    agentUnknown: (agent: string, when: string, names: string) => `${agent} ${when}跑了${names}，看不出结果`,
    agentMissing: (agent: string, when: string, names: string) => `${agent} ${when}没跑${names}`,
    agentPassed: (agent: string, when: string) => `${agent} ${when}跑过的检查都通过了`,
    byOutput: '按输出判断',
    unclear: '看不出结果'
  },
  en: {
    kindName: { test: 'tests', lint: 'lint', typecheck: 'typecheck', build: 'build' },
    mark: { pass: '✓', fail: '✗', unknown: '?', 'not-run': 'not run' },
    said: { pass: 'passed', fail: 'failed', unknown: 'unclear', 'not-run': 'not run' },
    noChecks: 'No checks run',
    current: 'this turn',
    previous: 'last turn',
    currentStart: 'This turn',
    previousStart: 'Last turn',
    editedNoChecks: (when: string) => `Edited files ${when}, ran no checks`,
    description: (when: string, items: string[]) => `${when}: ${items.join(', ')}`,
    kindSaid: (name: string, said: string) => `${name} ${said}`,
    namesSep: ', ',
    agentEditedNoChecks: (agent: string, when: string) => `${agent} edited files ${when} and ran no checks`,
    agentFailed: (agent: string, when: string, names: string) => `${agent}'s ${names} failed ${when}`,
    agentUnknown: (agent: string, when: string, names: string) => `${agent} ran ${names} ${when}; the result is unclear`,
    agentMissing: (agent: string, when: string, names: string) => `${agent} didn't run ${names} ${when}`,
    agentPassed: (agent: string, when: string) => `Every check ${agent} ran ${when} passed`,
    byOutput: 'Judged from the output',
    unclear: 'Result unclear'
  }
})

export function emptyTurnChecks(): TurnChecks {
  return { since: 0, edited: false, runs: [], known: [] }
}

const touched = (t: TurnRecord): boolean => t.edited || t.runs.length > 0

/** A new prompt: a fresh turn. What the last one ran becomes known, and it is kept as 上一轮 if it did anything. */
export function beginTurn(checks: TurnChecks, at: number): TurnChecks {
  const known = KIND_ORDER.filter((k) => checks.known.includes(k) || checks.runs.some((r) => r.kind === k))
  const previous = touched(checks) ? { since: checks.since, edited: checks.edited, runs: checks.runs } : checks.previous
  return { since: at, edited: false, runs: [], known, ...(previous ? { previous } : {}) }
}

/** The agent changed files: earlier results no longer describe the code. */
export function recordEdit(checks: TurnChecks): TurnChecks {
  if (checks.edited && !checks.previous) return checks
  const { previous: _gone, ...rest } = checks
  return { ...rest, edited: true }
}

/** New runs replace the earlier run of the same check (kind + command); the oldest fall off past MAX_RUNS. */
export function recordRuns(checks: TurnChecks, runs: readonly CheckRun[]): TurnChecks {
  if (runs.length === 0) return checks
  let list = checks.runs
  for (const run of runs) list = [...list.filter((r) => r.kind !== run.kind || r.command !== run.command), run]
  const { previous: _gone, ...rest } = checks
  return { ...rest, runs: list.slice(-MAX_RUNS) }
}

export type KindStatus = CheckOutcome | 'not-run'

export interface KindSummary {
  kind: CheckKind
  status: KindStatus
  /** This kind's runs, oldest first (empty for not-run). */
  runs: CheckRun[]
}

export interface TurnCheckView {
  /** previous: this turn has neither edited nor checked, so the last turn that did is shown. */
  turn: 'current' | 'previous'
  edited: boolean
  kinds: KindSummary[]
  runs: CheckRun[]
}

/**
 * How a kind came out: a full run that passed settles every earlier run of its kind; of the rest, any failure fails
 * it, then any unknown leaves it unknown.
 */
export function kindStatus(runs: readonly CheckRun[]): CheckOutcome {
  const settledAt = Math.max(-1, ...runs.filter((r) => r.full && r.outcome === 'pass').map((r) => r.at))
  const live = runs.filter((r) => r.at >= settledAt)
  if (live.some((r) => r.outcome === 'fail')) return 'fail'
  if (live.some((r) => r.outcome === 'unknown')) return 'unknown'
  return 'pass'
}

/** What to show for a session, or null when there is nothing to say (no edits and no checks, this turn or before). */
export function turnCheckView(checks: TurnChecks | undefined): TurnCheckView | null {
  if (!checks) return null
  const record: TurnRecord | undefined = touched(checks) ? checks : checks.previous
  if (!record) return null
  const kinds: KindSummary[] = []
  for (const kind of KIND_ORDER) {
    const runs = record.runs.filter((r) => r.kind === kind)
    if (runs.length > 0) kinds.push({ kind, status: kindStatus(runs), runs })
    else if (EXPECTED.has(kind) && checks.known.includes(kind)) kinds.push({ kind, status: 'not-run', runs: [] })
  }
  return { turn: record === checks ? 'current' : 'previous', edited: record.edited, kinds, runs: record.runs }
}

/** A space where Latin meets CJK (“lint 没过”, “的 lint”), as the rest of the UI copy writes it. */
const spaced = (text: string): string => text.replace(/([A-Za-z0-9])(?=[\u4e00-\u9fff])/g, '$1 ').replace(/([\u4e00-\u9fff])(?=[A-Za-z])/g, '$1 ')

/** `测试 ✓ · lint ✗ · 类型 未跑`; `没跑检查` when the turn edited files and ran none. */
export function checksText(view: TurnCheckView): string {
  const m = pick(M)
  if (view.kinds.length === 0) return m.noChecks
  return view.kinds.map((k) => `${KIND_LABEL[k.kind]} ${m.mark[k.status]}`).join(' · ')
}

/** The accessible name / tooltip: `这一轮：测试通过，lint 没过，类型检查没跑`. */
export function checksDescription(view: TurnCheckView): string {
  const m = pick(M)
  const when = view.turn === 'current' ? m.current : m.previous
  if (view.kinds.length === 0) return m.editedNoChecks(when)
  return spaced(m.description(view.turn === 'current' ? m.currentStart : m.previousStart, view.kinds.map((k) => m.kindSaid(m.kindName[k.kind], m.said[k.status]))))
}

export type ChecksTone = 'ok' | 'warn' | 'error'

/** The merge sheet's line (PRD F4): its tone and sentence; never a reason not to merge. */
export function checksVerdict(view: TurnCheckView, agent: string): { tone: ChecksTone; text: string } {
  const { tone, text } = verdict(view, agent)
  return { tone, text: spaced(text) }
}

function verdict(view: TurnCheckView, agent: string): { tone: ChecksTone; text: string } {
  const m = pick(M)
  const when = view.turn === 'current' ? m.current : m.previous
  const names = (status: KindStatus) => view.kinds.filter((k) => k.status === status).map((k) => m.kindName[k.kind]).join(m.namesSep)
  if (view.kinds.length === 0) return { tone: 'warn', text: m.agentEditedNoChecks(agent, when) }
  const failed = names('fail')
  if (failed) return { tone: 'error', text: m.agentFailed(agent, when, failed) }
  const unknown = names('unknown')
  if (unknown) return { tone: 'warn', text: m.agentUnknown(agent, when, unknown) }
  const missing = names('not-run')
  if (missing) return { tone: 'warn', text: m.agentMissing(agent, when, missing) }
  return { tone: 'ok', text: m.agentPassed(agent, when) }
}

/** A note for one run's line: how its outcome is known when it is not from the exit code. */
export function runNote(run: CheckRun): string | undefined {
  if (run.basis === 'output') return pick(M).byOutput
  return run.outcome === 'unknown' ? pick(M).unclear : undefined
}

export function sameTurnChecks(a: TurnChecks, b: TurnChecks): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
