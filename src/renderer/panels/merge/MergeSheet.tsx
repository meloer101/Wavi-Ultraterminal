// 合并到 <base> (PRD F4, Figma 05 19:814): the precheck as a short checklist (ahead, behind, conflicts, uncommitted
// work, an upstream the base has not pulled), the `[scripts] test` gate, then 合并. Local only: the same main-process
// merge as Git · 变更's 合并 (ship.shipToMain) — the base is fast-forwarded to its upstream first, then one squash commit on it, titled after the session; nothing is pushed (推送 of the base is the
// chain's next move) and the worktree stays. With conflicts the only way forward is the worktree's agent: the
// instructions go into its input line, unsent. Nothing is changed until 合并 is pressed. Glass sheet material as the
// new-session sheet (PRD §5).
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { ArrowRight, CircleX, GitBranch } from 'lucide-react'
import type { MergePrecheck } from '@shared/git-merge'
import type { ShipMainResult } from '@shared/ship'
import { defineMessages } from '@shared/i18n'
import { useMessages } from '../../i18n'
import { ensureAgentUp } from '../../lifecycle/agent-up'
import { useRepoScripts } from '../../scripts/run-script'
import { insertIntoTerminal } from '../../session-io'
import { useWorkspace } from '../../state/workspace'
import { Segmented } from '../../ui/Segmented'
import { useTurnCheckView } from '../../turn-checks/TurnChecksTag'
import { Line, TestResult, TurnChecks } from './parts'
import { PrMergeSheet } from './PrMergeSheet'
import { usePrStatus } from '../../pull-requests/store'
import { AfterMerge } from '../../attempts/AfterMerge'
import { attemptForWorktrees } from '../../attempts/actions'
import { markGroupMerged } from '../../state/attempt-groups'
import {
  agentLabel,
  agentSessionFor,
  checkLines,
  conflictPrompt,
  conflictReason,
  nothingToMerge,
  resultLines,
  testBlocksMerge,
  testLine,
  type CheckLine,
  type MergeTestState
} from './model'
import { closeMergeSheet, useMergeSheet, type MergeTarget } from './store'
import styles from './MergeSheet.module.css'

const M = defineMessages({
  zh: {
    mergeTo: '合并到',
    mergeInto: (base: string) => `合并到 ${base}`,
    local: '本地',
    moved: '分支或基线在检查之后又变了，已重新检查',
    handOffFailed: (agent: string, error: string) => `没有交给 ${agent}：${error}`,
    checking: '正在检查…',
    checkFailed: (message: string) => `没能检查：${message}`,
    conflictedFiles: '冲突的文件',
    moreFiles: (count: number) => `还有 ${count} 个文件`,
    handOffNote: (agent: string) => `说明会放进 ${agent} 的输入行，看过后按回车发送`,
    resolveInTerminal: '在终端里解决冲突后重新打开',
    cancel: '取消',
    close: '关闭',
    done: '完成',
    handingOff: (agent: string) => `正在交给 ${agent}…`,
    handOff: (agent: string) => `交给 ${agent} 解决`,
    merging: '正在合并…',
    merge: '合并'
  },
  en: {
    mergeTo: 'Merge into',
    mergeInto: (base: string) => `Merge into ${base}`,
    local: 'Local',
    moved: 'The branch or the base changed after the check; checked again',
    handOffFailed: (agent: string, error: string) => `Not handed to ${agent}: ${error}`,
    checking: 'Checking…',
    checkFailed: (message: string) => `Couldn't check: ${message}`,
    conflictedFiles: 'Conflicted files',
    moreFiles: (count: number) => `${count} more ${count === 1 ? 'file' : 'files'}`,
    handOffNote: (agent: string) => `The instructions go into ${agent}'s input line; press Return to send once you've checked them`,
    resolveInTerminal: 'Resolve the conflicts in the terminal, then reopen',
    cancel: 'Cancel',
    close: 'Close',
    done: 'Done',
    handingOff: (agent: string) => `Handing to ${agent}…`,
    handOff: (agent: string) => `Hand to ${agent}`,
    merging: 'Merging…',
    merge: 'Merge'
  }
})

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const
/** Conflicted files listed in the sheet; the rest are counted. */
const MAX_LISTED_CONFLICTS = 8

export function MergeSheet() {
  const target = useMergeSheet((s) => s.target)
  const generation = useMergeSheet((s) => s.generation)
  return target ? <Target key={generation} target={target} /> : null
}

/**
 * A branch with an open PR merges on GitHub by default (PRD F16 v1.63, Figma 22C); 本地 is the local merge as before.
 * Without a PR (or without gh) the sheet is the local one, with no switch.
 */
function Target({ target }: { target: MergeTarget }) {
  const m = useMessages(M)
  const status = usePrStatus(target.worktreePath)
  const pr = status?.pr
  const live = pr && (pr.state === 'open' || pr.state === 'draft') && pr.details ? pr : null
  const [to, setTo] = useState<'pr' | 'local'>(live ? 'pr' : 'local')
  const choice = live ? (
    <Segmented
      label={m.mergeTo}
      value={to}
      options={[
        { value: 'pr', label: `GitHub PR #${live.number}` },
        { value: 'local', label: m.local }
      ]}
      onChange={setTo}
    />
  ) : null
  return to === 'pr' && live && status ? <PrMergeSheet target={target} status={status} targetSwitch={choice} /> : <Sheet target={target} targetSwitch={choice} />
}

type Phase =
  | { kind: 'checking' }
  | { kind: 'failed-check'; message: string }
  | { kind: 'ready'; check: MergePrecheck }
  | { kind: 'merging'; check: MergePrecheck }
  | { kind: 'done'; check: MergePrecheck; lines: CheckLine[] }

function Sheet({ target, targetSwitch }: { target: MergeTarget; targetSwitch: ReactNode }) {
  const m = useMessages(M)
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' })
  const [failure, setFailure] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  // 交给 … 解决 in flight: the agent may have to start first, and the text may be refused while a menu is open.
  const [handing, setHanding] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const mounted = useRef(true)
  const titleId = useId()
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const ids = target.worktreeIds
  const sessions = useWorkspace((s) => s.sessions)
  const activeId = useWorkspace((s) => s.activeSessionId)
  const here = sessions.filter((s) => ids.includes(s.worktreeId))
  const agent = agentSessionFor(here, activeId)
  // 一题多解: read when the sheet opens.
  const [attemptGroup] = useState(() => attemptForWorktrees(ids))

  // The precheck: once when the sheet opens, again after recheck() (the sheet opens in 'checking').
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    window.tr.gitWorktrees
      .mergePrecheck(target.root, target.worktreePath)
      .then((next) => {
        if (!live) return
        setPhase({ kind: 'ready', check: next })
      })
      .catch((error: unknown) => live && setPhase({ kind: 'failed-check', message: error instanceof Error ? error.message : String(error) }))
    return () => {
      live = false
    }
  }, [target, attempt])

  const recheck = (): void => {
    setPhase({ kind: 'checking' })
    setAttempt((n) => n + 1)
  }

  useEffect(() => sheetRef.current?.focus(), [])

  const ready = phase.kind === 'ready' ? phase.check : null
  const gitMergeable = ready !== null && ready.blocker === null && ready.conflicts.length === 0
  // Nothing to merge (Figma 30B / 30C): one line saying where the branch stands, then 关闭 — no checks.
  const settled = ready !== null && nothingToMerge(ready)
  const repo = useRepoScripts(target.worktreePath)
  const scriptsKnown = repo !== null
  const testScript = repo?.scripts.test
  const [testRun, setTestRun] = useState<{ attempt: number; script: string; state: MergeTestState } | null>(null)
  const [testAttempt, setTestAttempt] = useState(0)
  // Until this attempt reports back, the test is running. No setState for that: it is just the absence of a result.
  const reported = testRun && testRun.attempt === testAttempt && testRun.script === testScript ? testRun.state : null
  const testing = phase.kind === 'ready' && gitMergeable && testScript !== undefined
  const testState: MergeTestState | null = testing ? (reported ?? { status: 'running', command: testScript }) : phase.kind === 'merging' ? reported : null

  // Git precheck first. When it can merge and the repo names `test`, run that before 合并 is offered.
  // Closing the sheet (cleanup) kills the process. 重新运行 bumps testAttempt.
  useEffect(() => {
    if (!testing || testScript === undefined) return
    let live = true
    const command = testScript
    const attempt = testAttempt
    const dir = target.worktreePath
    void (async () => {
      try {
        const approval = await window.tr.repoScripts.approve(dir, 'test')
        if (!live) return
        if (approval !== 'approved') {
          setTestRun({ attempt, script: command, state: { status: 'declined', command } })
          return
        }
        const result = await window.tr.repoScripts.run(dir, 'test')
        if (!live || result.cancelled) return
        const state: MergeTestState =
          result.code === 0
            ? { status: 'passed', command }
            : { status: 'failed', command, code: result.code, output: result.output }
        setTestRun({ attempt, script: command, state })
      } catch (error) {
        if (!live) return
        setTestRun({
          attempt,
          script: command,
          state: { status: 'failed', command, code: null, output: error instanceof Error ? error.message : String(error) }
        })
      }
    })()
    return () => {
      live = false
      void window.tr.repoScripts.cancel(dir)
    }
  }, [testing, testScript, testAttempt, target.worktreePath])

  const mergeable = gitMergeable && scriptsKnown && !testBlocksMerge(testState, testScript !== undefined)
  const checksView = useTurnCheckView(agent?.id)

  const merge = async (): Promise<void> => {
    if (!ready || !mergeable) return
    setFailure(null)
    setNote(null)
    setPhase({ kind: 'merging', check: ready })
    const title = here.find((s) => s.id === agent?.id)?.title ?? here[0]?.title
    // The exit's own merge: the base caught up with its upstream, then squashed into — never pushed. Only the tip the
    // checklist and the test saw is merged.
    let result: ShipMainResult
    try {
      result = await window.tr.ship.shipToMain({
        root: target.root,
        worktree: target.worktreePath,
        message: '',
        method: 'squash',
        paths: null,
        head: ready.head,
        ...(title ? { title } : {})
      })
    } catch (error) {
      result = { ok: false, step: 'merge', reason: 'failed', message: error instanceof Error ? error.message : String(error) }
    }
    if (!result.ok) {
      // Moved since the check (or the base it caught up with now conflicts): the checklist is read again.
      if (result.stale || result.reason === 'conflicts') {
        setNote(m.moved)
        recheck()
        return
      }
      setFailure(result.message)
      setPhase({ kind: 'ready', check: ready })
      return
    }
    if (attemptGroup) markGroupMerged(attemptGroup.groupId, attemptGroup.sessionId, ready.branch)
    setPhase({ kind: 'done', check: ready, lines: resultLines(result, ready.base) })
  }

  // The sheet stays until the text is in the agent's input line: when it cannot go there (a menu is open in the
  // terminal, the agent did not start) the failure line says so and 交给 … 解决 can be pressed again.
  const handToAgent = async (): Promise<void> => {
    if (!ready || !agent || handing) return
    setFailure(null)
    setHanding(true)
    const prompt = conflictPrompt(ready)
    useWorkspace.getState().setActiveSession(agent.id)
    try {
      await ensureAgentUp(agent.id)
      // Into the input line only: resolving conflicts can cost a lot of tokens, so the user sends it (PRD §2).
      await insertIntoTerminal(agent.id, prompt)
    } catch (error) {
      if (mounted.current) {
        setFailure(m.handOffFailed(agentLabel(agent.kind), error instanceof Error ? error.message : String(error)))
        setHanding(false)
      }
      return
    }
    if (!mounted.current) return
    closeMergeSheet(false)
    useWorkspace.getState().requestTerminalFocus()
  }

  const primary = (): void => {
    if (phase.kind === 'done' || settled) closeMergeSheet(true)
    else if (mergeable) void merge()
    else if (ready && ready.conflicts.length > 0 && !ready.blocker && agent) void handToAgent()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return
    if (event.key === 'Escape' && phase.kind !== 'merging') {
      event.preventDefault()
      closeMergeSheet(true)
    } else if (event.key === 'Enter' && event.metaKey) {
      event.preventDefault()
      primary()
    }
  }

  const onScrimMouseDown = (event: MouseEvent): void => {
    if (event.target === event.currentTarget && phase.kind !== 'merging') closeMergeSheet(true)
  }

  const shown = phase.kind === 'ready' || phase.kind === 'merging' || phase.kind === 'done' ? phase.check : null
  const busy = phase.kind === 'merging'
  const conflicts = shown && phase.kind !== 'done' ? shown.conflicts : []

  return (
    <div className={styles.scrim} onMouseDown={onScrimMouseDown} data-region="merge">
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={phase.kind === 'checking' || busy || handing}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        data-testid="merge-sheet"
      >
        <header className={styles.context}>
          {targetSwitch ? (
            <div className={styles.titleRow}>
              <h2 id={titleId} className={styles.title}>
                {m.mergeTo}
              </h2>
              {targetSwitch}
            </div>
          ) : (
            <h2 id={titleId} className={styles.title}>
              {m.mergeInto(shown?.base || '…')}
            </h2>
          )}
          {shown?.branch && (
            <p className={styles.branches}>
              <GitBranch {...ICON} />
              <span>{shown.branch}</span>
              <ArrowRight {...ICON} />
              <span>{shown.base}</span>
            </p>
          )}
        </header>

        <div className={styles.checks} aria-live="polite">
          {phase.kind === 'checking' && <p className={styles.muted}>{m.checking}</p>}
          {phase.kind === 'failed-check' && <Line line={{ tone: 'error', text: m.checkFailed(phase.message) }} />}
          {phase.kind === 'done' && phase.lines.map((line) => <Line key={line.text} line={line} />)}
          {phase.kind === 'done' && attemptGroup && <AfterMerge groupId={attemptGroup.groupId} />}
          {shown && phase.kind !== 'done' && checkLines(shown).map((line) => <Line key={line.text} line={line} />)}
          {shown && phase.kind !== 'done' && !settled && agent && checksView && <TurnChecks view={checksView} kind={agent.kind} />}
          {shown && phase.kind !== 'done' && testState && (
            <TestResult line={testLine(testState)} onRerun={() => setTestAttempt((n) => n + 1)} />
          )}
          {conflicts.length > 0 && (
            <ul className={styles.conflicts} aria-label={m.conflictedFiles}>
              {conflicts.slice(0, MAX_LISTED_CONFLICTS).map((c) => (
                <li key={c.path} className={styles.conflict}>
                  <span className={styles.conflictPath}>{c.path}</span>
                  <span className={styles.conflictReason}>{conflictReason(c)}</span>
                </li>
              ))}
              {conflicts.length > MAX_LISTED_CONFLICTS && (
                <li className={styles.conflictMore}>{m.moreFiles(conflicts.length - MAX_LISTED_CONFLICTS)}</li>
              )}
            </ul>
          )}
          {note && <p className={styles.muted}>{note}</p>}
        </div>

        {failure && (
          <p className={styles.failure} role="alert">
            <CircleX {...ICON} />
            {failure}
          </p>
        )}

        <footer className={styles.footer}>
          {conflicts.length > 0 && !shown?.blocker && (
            <span className={styles.footerNote}>
              {agent ? m.handOffNote(agentLabel(agent.kind)) : m.resolveInTerminal}
            </span>
          )}
          <span className={styles.spacer} />
          {phase.kind !== 'done' && !settled && (
            <button type="button" className={styles.cancel} disabled={busy} onClick={() => closeMergeSheet(true)}>
              {m.cancel}
            </button>
          )}
          {settled ? (
            <button type="button" className={styles.close} onClick={() => closeMergeSheet(true)}>
              {m.close}
              <span className={styles.shortcut}>esc</span>
            </button>
          ) : phase.kind === 'done' ? (
            <button type="button" className={styles.primary} onClick={() => closeMergeSheet(true)}>
              {m.done}
              <span className={styles.shortcut}>⌘↵</span>
            </button>
          ) : conflicts.length > 0 && !shown?.blocker ? (
            agent && (
              <button type="button" className={styles.primary} disabled={handing} onClick={() => void handToAgent()}>
                {handing ? m.handingOff(agentLabel(agent.kind)) : m.handOff(agentLabel(agent.kind))}
                <span className={styles.shortcut}>⌘↵</span>
              </button>
            )
          ) : (
            <button type="button" className={styles.primary} disabled={!mergeable || busy} onClick={() => void merge()}>
              {busy ? m.merging : m.merge}
              <span className={styles.shortcut}>⌘↵</span>
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
