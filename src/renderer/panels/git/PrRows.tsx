// Git · 变更's GitHub parts beyond the PR headline (PRD F16 v1.63 / v1.78, Figma 29R): the per-PR switches — label
// first, then the switch — and what they are doing (said in the zone's facts line), and, when 自动修复 stopped — a
// brake, or the base failing already — the decision surface: the question or the brake's reason with its answers in
// place of the exits (29G / 29J; shared with the base rows in BaseCiRow.tsx).
import type { PrStatus } from '@shared/pull-requests'
import { defineMessages } from '@shared/i18n'
import { useMessages } from '../../ui/i18n'
import {
  agentIdle,
  agentName,
  declineFix,
  discardFix,
  fixAgentIn,
  prWantsFix,
  proceedAnyway,
  pushAnyway,
  retryFix,
  setAutoFix,
  setMergeWhenGreen,
  stopFix
} from '../../pull-requests/auto-fix'
import { automationText, mergeWhenGreenOn, stopActions, stopParts, type FixRun, type FixScope } from '../../pull-requests/auto-fix-model'
import { useBaseCi } from '../../pull-requests/base-ci'
import { usePullRequests } from '../../pull-requests/store'
import { useWorkspace } from '../../state/workspace'
import { Toggle } from '../../ui/Toggle'
import ci from './CiRows.module.css'

const M = defineMessages({
  zh: {
    decline: '不修',
    fixHere: '在这里修',
    pushAnywayTitle: '不管刹车，把这次修复推上去（先确认）',
    pushAnyway: '仍然推送',
    discardTitle: '把分支退回修复开始前的提交',
    discard: '丢弃',
    retry: (agent: string) => `让 ${agent} 重修`,
    stop: '停下',
    autoFix: '自动修复',
    autoFixTitle: 'CI 失败或有新评论时，等 agent 空闲后让它修并提交，Wavi 检查后推送（用你的额度，每个 PR 有次数上限）',
    noAgent: '这个 worktree 没有 agent 会话',
    mergeWhenGreen: '通过后合并',
    draft: '草稿 PR 不能合并',
    mergeWhenGreenTitle: '检查通过后由 GitHub 合并（仓库要开着 auto-merge）'
  },
  en: {
    decline: "Don't fix",
    fixHere: 'Fix here',
    pushAnywayTitle: 'Push this fix despite the brake (asks first)',
    pushAnyway: 'Push anyway',
    discardTitle: 'Reset the branch to the commit before the fix began',
    discard: 'Discard',
    retry: (agent: string) => `Let ${agent} fix again`,
    stop: 'Stop',
    autoFix: 'Auto-fix',
    autoFixTitle:
      'When CI fails or new comments arrive, the agent fixes them and commits once it is idle; Wavi checks and pushes (uses your usage, with a limit on attempts per PR)',
    noAgent: 'This worktree has no agent session',
    mergeWhenGreen: 'Merge when green',
    draft: "A draft PR can't be merged",
    mergeWhenGreenTitle: 'GitHub merges once the checks pass (the repository needs auto-merge turned on)'
  }
})

type StoppedRun = Extract<FixRun, { kind: 'stopped' }>

/** The worktree's agent session, for the rows' switches and words: the one 自动修复 hands fixes to (fixAgentIn). */
export function useAgentOf(worktreePath: string) {
  return useWorkspace((s) => fixAgentIn(s, worktreePath))
}

/** The stopped fix waiting for the user on this worktree, the PR's first, then the base push's; null when none. */
export function useStoppedFix(
  worktreePath: string,
  prNumber: number | null
): { scope: FixScope; run: StoppedRun; note: string | null; attempts: number } | null {
  const pr = usePullRequests((s) => s.automation[worktreePath])
  const base = useBaseCi((s) => s.automation[worktreePath])
  if (pr && prNumber !== null && pr.number === prNumber && pr.run?.kind === 'stopped') return { scope: 'pr', run: pr.run, note: pr.note ?? null, attempts: pr.attempts }
  if (base?.run?.kind === 'stopped') return { scope: 'base', run: base.run, note: base.note ?? null, attempts: base.attempts }
  return null
}

/**
 * The decision surface while a fix is stopped (Figma 29R; 29G / 29J), in place of the exits: the question (or the
 * brake's reason) with 不修 · 在这里修, or 仍然推送 · 丢弃 · 让 Claude 重修. A surface of its own, hung out by its padding
 * so its words stay on the text column.
 */
export function FixStopFooter({ scope, worktreePath, run, agent, note, attempts }: { scope: FixScope; worktreePath: string; run: StoppedRun; agent: string; note: string | null; attempts?: number }) {
  const m = useMessages(M)
  const actions = stopActions(run)
  const { question } = stopParts(run.decision, attempts)
  return (
    <div className={ci.decision} data-decision data-testid="fix-stop-actions">
      <span className={ci.question} role="status" data-testid="fix-stop" title={note ? `${question}\n${note}` : question}>
        {question}
      </span>
      <span className={ci.spacer} />
      {actions.kind === 'ask' ? (
        <>
          <button type="button" className={ci.action} onClick={() => declineFix(scope, worktreePath)}>
            {m.decline}
          </button>
          <button type="button" className={ci.action} data-primary onClick={() => proceedAnyway(scope, worktreePath)}>
            {m.fixHere}
          </button>
        </>
      ) : (
        <>
          {actions.push && (
            <button type="button" className={ci.action} title={m.pushAnywayTitle} onClick={() => void pushAnyway(scope, worktreePath)}>
              {m.pushAnyway}
            </button>
          )}
          {actions.discard && (
            <button type="button" className={ci.action} title={m.discardTitle} onClick={() => void discardFix(scope, worktreePath)}>
              {m.discard}
            </button>
          )}
          <button type="button" className={ci.action} data-primary onClick={() => void retryFix(scope, worktreePath)}>
            {m.retry(agent)}
          </button>
        </>
      )}
    </div>
  )
}

/** 停下 while the agent works on a fix. */
export function FixStopButton({ scope, worktreePath, run }: { scope: FixScope; worktreePath: string; run: FixRun | null | undefined }) {
  const m = useMessages(M)
  if (run?.kind !== 'fixing') return null
  return (
    <button type="button" className={ci.action} onClick={() => stopFix(scope, worktreePath)}>
      {m.stop}
    </button>
  )
}

/** What the PR's switches are doing (Figma 29I), for the zone's facts line — 自动修复先停, 第 2 次 · Claude 在修, … — and the fix note. */
export function usePrAutomationWords(worktreePath: string, status: PrStatus | null | undefined): { text: string | null; note: string | null } | null {
  const stored = usePullRequests((s) => s.automation[worktreePath])
  const session = useAgentOf(worktreePath)
  const pr = status?.pr
  if (!status || !pr || (pr.state !== 'open' && pr.state !== 'draft')) return null
  const state = stored?.number === pr.number ? stored : undefined
  const note = state?.note ?? null
  if (state?.run?.kind === 'stopped') return { text: stopParts(state.run.decision, state.attempts).fact, note }
  const words = automationText(state, status, { idle: agentIdle(session), wants: state?.autoFix === true && prWantsFix(worktreePath, status), name: agentName(session) })
  return { text: words.text || null, note }
}

/** 自动修复 · 通过后合并 (PRD F16 · L3, Figma 29R): the label, then its switch; 停下 at the end while a fix runs. Open PRs only. */
export function PrAutomationRow({ worktreePath, status }: { worktreePath: string; status: PrStatus }) {
  const m = useMessages(M)
  const stored = usePullRequests((s) => s.automation[worktreePath])
  const session = useAgentOf(worktreePath)
  const pr = status.pr
  if (!pr || (pr.state !== 'open' && pr.state !== 'draft')) return null
  const state = stored?.number === pr.number ? stored : undefined
  return (
    <div className={ci.switches} data-testid="pr-automation">
      <span className={ci.label}>{m.autoFix}</span>
      <Toggle
        label={m.autoFix}
        checked={state?.autoFix === true}
        disabled={!session}
        title={session ? m.autoFixTitle : m.noAgent}
        onChange={(on) => setAutoFix(worktreePath, on)}
      />
      <span className={ci.gap} />
      <span className={ci.label}>{m.mergeWhenGreen}</span>
      <Toggle
        label={m.mergeWhenGreen}
        checked={mergeWhenGreenOn(status)}
        disabled={!pr.details || pr.state === 'draft'}
        title={pr.state === 'draft' ? m.draft : m.mergeWhenGreenTitle}
        onChange={(on) => void setMergeWhenGreen(worktreePath, on)}
      />
      <span className={ci.spacer} />
      <FixStopButton scope="pr" worktreePath={worktreePath} run={state?.run} />
    </div>
  )
}
