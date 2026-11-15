// Git · 变更's exits and 归档 for the phone (PRD F22, Figma 45I / 45J): the same plan, run and archive as the desktop's
// buttons (pull-requests/exit-model.ts, ship-runner.ts, archive/actions.ts). The phone runs 合并, 创建 PR / 推送到 PR #N
// and 推送 of the base; a primary only the Mac runs (提交, 同步, 拉取, 交给 agent, 继续) is shown blocked with the chain's
// state line and where it runs. The run's progress reaches the phone with the session list (model.ts `remoteShip`).
import { remoteFail, type RemoteExit, type RemoteExits, type RemoteMacMove, type RemoteResult, type RemoteShipAction } from '@shared/remote'
import { defineMessages, pick } from '@shared/i18n'
import type { ShipPreflight } from '@shared/ship'
import { CHAIN_LABEL, type ChainMove, type ChainState } from '@shared/ship-chain'
import { checksText, turnCheckView } from '@shared/turn-checks'
import type { Project, Session, Worktree } from '@shared/types'
import { archiveTargetFor, archiveWorktree, blockerFor } from '../archive/actions'
import { commentTarget } from '../panels/git/comments'
import { tickedPaths } from '../panels/git/changes-model'
import { gitOf } from '../panels/git/store'
import { agentLabel } from '../panels/merge/model'
import { exitPlan, shipContextFor, type ExitPlan, type ShipExit } from '../pull-requests/exit-model'
import { cancelShip, editShip, handConflictsToAgent, readRemembered, retryShip, startShip, submitShip, switchToPr, useShips } from '../pull-requests/ship-runner'
import { submitBlocker } from '../pull-requests/ship-flow'
import { useBaseCi } from '../pull-requests/base-ci'
import { usePullRequests } from '../pull-requests/store'
import { useSessionMeta } from '../session-meta/store'
import { useWorkspace } from '../state/workspace'
import { hidePaths } from './model'

const M = defineMessages({
  zh: {
    stopped: '自动修复停下了，在 Mac 上回答后才能用出口',
    readingPr: '正在读取 PR…',
    onMac: (label: string) => `在 Mac 上${label}`,
    joined: (line: string, where: string) => `${line}；${where}`,
    noWorktree: '找不到这个 worktree',
    approveScript: '这个仓库的 archive 脚本要先在 Mac 上批准一次',
    noSession: '会话不存在',
    notGit: '不是 git 仓库',
    openPr: (number: number) => `打开 PR #${number}`,
    exitUnavailable: '这个出口现在不能用',
    exitRunning: '这个 worktree 已经有一个出口在进行',
    checking: '正在检查…',
    checksLine: (checks: string) => `这一轮的检查：${checks}`,
    exitEnded: '这个出口已经结束了',
    cantEdit: '现在不能改',
    notWritten: '还没写好',
    nothingToRetry: '没有要重试的步骤',
    reviewStop: '审阅找到了 P0 / P1：在 Mac 上选择让 agent 修或照样推送',
    cantCancel: '正在执行，不能取消',
    noConflicts: '没有冲突要交给 agent',
    noAgent: '这个 worktree 没有 agent 会话',
    handFailed: '没能交给 agent',
    notRefused: '推送没有被拒绝',
    archiveAnyway: (message: string) => `${message}；可以在 Mac 上选择仍然归档`
  },
  en: {
    stopped: 'Auto-fix stopped. Answer it on the Mac before using the exits',
    readingPr: 'Reading the PR…',
    onMac: (label: string) => `${label} on the Mac`,
    joined: (line: string, where: string) => `${line}; ${where}`,
    noWorktree: 'Can’t find this worktree',
    approveScript: 'This repository’s archive script must be approved once on the Mac',
    noSession: 'Session not found',
    notGit: 'Not a git repository',
    openPr: (number: number) => `Open PR #${number}`,
    exitUnavailable: 'This exit can’t be used right now',
    exitRunning: 'An exit is already running for this worktree',
    checking: 'Checking…',
    checksLine: (checks: string) => `Checks this turn: ${checks}`,
    exitEnded: 'This exit has already ended',
    cantEdit: 'Can’t edit right now',
    notWritten: 'Not written yet',
    nothingToRetry: 'No step to retry',
    reviewStop: 'Review found P0 / P1: on the Mac, choose to have the agent fix it or push anyway',
    cantCancel: 'Running, can’t cancel',
    noConflicts: 'No conflicts to hand to the agent',
    noAgent: 'This worktree has no agent session',
    handFailed: 'Couldn’t hand to agent',
    notRefused: 'The push wasn’t refused',
    archiveAnyway: (message: string) => `${message}; you can choose to archive anyway on the Mac`
  }
})

interface Place {
  session: Session
  worktree: Worktree
  project: Project
}

function placeOf(sessionId: string): Place | null {
  const state = useWorkspace.getState()
  const session = state.sessions.find((s) => s.id === sessionId)
  const worktree = session && state.worktrees.find((w) => w.id === session.worktreeId)
  const project = worktree && state.projects.find((p) => p.id === worktree.projectId)
  return session && worktree && project && !worktree.archived ? { session, worktree, project } : null
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** A refusal for the phone, without the Mac's folders in it. */
const fail = (place: Place, message: string): RemoteResult => remoteFail(hidePaths(message, [place.worktree.path, place.project.rootPath]))

/** Git · 变更 swaps the exits for a stopped 自动修复's decision (PrRows.tsx `useStoppedFix`); the phone waits for it too. */
function stoppedFix(worktreePath: string, prNumber: number | null): boolean {
  const pr = usePullRequests.getState().automation[worktreePath]
  const base = useBaseCi.getState().automation[worktreePath]
  return (pr !== undefined && prNumber !== null && pr.number === prNumber && pr.run?.kind === 'stopped') || base?.run?.kind === 'stopped'
}
const STOPPED = (): string => pick(M).stopped

/** What Git · 变更 would read: the changes, the preflight and the PR, then the plan. */
async function planFor(place: Place) {
  const { worktree, project } = place
  // Git · 变更 asks about the branch's PR when it opens; so does the phone.
  window.tr.pr.refresh(worktree.path)
  const changes = await window.tr.git.changes(worktree.path, worktree.baseBranch ?? undefined)
  if (!changes) return null
  const preflight: ShipPreflight = await window.tr.ship
    .preflight({ root: project.rootPath, worktree: worktree.path })
    .catch((error: unknown) => ({ ok: false, message: errorText(error) }))
  const pr = usePullRequests.getState()
  const prStatus = pr.gh === 'ready' ? (pr.byWorktree[worktree.path] ?? null) : null
  // The Mac's checkboxes hold for the phone too: unticked files stay in the working tree (as chain-actions.ts reads them).
  const ticked = tickedPaths(changes.uncommitted, gitOf(worktree.path).unticked)
  const ws = useWorkspace.getState()
  const agent = commentTarget(worktree, ws.sessions, ws.worktrees, place.session.id)
  const plan = exitPlan({
    preflight,
    remembered: readRemembered(project.rootPath),
    prStatus,
    changes,
    isMain: worktree.isMain,
    projectRoot: project.rootPath,
    gh: pr.gh,
    agent: agent ? agentLabel(agent.kind) : null,
    sessions: ws.sessions.filter((s) => s.worktreeId === worktree.id),
    ticked: ticked.length
  })
  return { changes, preflight, plan, ticked, prStatus }
}

function phoneExit(place: Place, exit: ShipExit, plan: ExitPlan, stopped: boolean): RemoteExit {
  const url = exit.kind === 'open-pr' ? plan.pr?.url : undefined
  const blocker = stopped ? STOPPED() : (plan.blocker(exit) ?? (exit.kind === 'open-pr' && !url ? pick(M).readingPr : null))
  return { kind: exit.kind, label: exit.label, blocker: blocker ? hidePaths(blocker, [place.worktree.path, place.project.rootPath]) : null, ...(url ? { url } : {}) }
}

const MAC_MOVES: ReadonlySet<string> = new Set<RemoteMacMove>(['commit', 'sync', 'pull', 'push', 'handoff', 'continue', 'abort'])
const macMove = (move: ChainMove | null): move is ChainMove & { id: RemoteMacMove } => move !== null && MAC_MOVES.has(move.id)

/** A primary only the Mac runs: shown blocked, with the chain's state line and where it runs. */
function onMac(place: Place, chain: ChainState, move: ChainMove & { id: RemoteMacMove }): RemoteExit {
  const where = pick(M).onMac(move.label)
  const line = move.blocker ?? chain.headline?.text ?? null
  return { kind: move.id, label: move.label, blocker: hidePaths(line && line !== where ? pick(M).joined(line, where) : where, [place.worktree.path, place.project.rootPath]) }
}

async function archiveBlocker(place: Place): Promise<string | null> {
  const target = archiveTargetFor(place.worktree.id)
  if (!target) return pick(M).noWorktree
  const blocker = blockerFor(target)
  if (blocker) return blocker
  // The archive script's approval is a dialog on the Mac, which nobody may be in front of.
  const info = await window.tr.repoScripts.get(target.worktreePath).catch(() => null)
  return info?.scripts.archive !== undefined && !info.approved ? pick(M).approveScript : null
}

export async function remoteExits(sessionId: string): Promise<RemoteResult> {
  const place = placeOf(sessionId)
  if (!place) return remoteFail(pick(M).noSession)
  const found = await planFor(place)
  if (!found) return remoteFail(pick(M).notGit)
  const { preflight, plan } = found
  const { chain } = plan
  const { primary, secondary } = plan.exits
  const stopped = stoppedFix(place.worktree.path, plan.pr?.number ?? null)
  const open: ShipExit | null = plan.idlePr ? { kind: 'open-pr', number: plan.idlePr.number, label: pick(M).openPr(plan.idlePr.number), blocker: null } : null
  const next = chain.next
  const hide = (text: string | null): string | null => (text ? hidePaths(text, [place.worktree.path, place.project.rootPath]) : null)
  // The chain's primary decides: 推送 of the base the phone runs; a move only the Mac runs is shown blocked, the exit
  // beside it (提交's) still runs; else the exits as the plan has them. 归档 is its own button.
  const exitBeside = chain.second && (chain.second.id === 'main' || chain.second.id === 'pr') ? [primary, secondary].find((e) => e?.kind === chain.second!.id) : undefined
  const [first, other]: [RemoteExit | null, RemoteExit | null] =
    next?.id === 'push-base'
      ? [{ kind: 'push-base', label: next.label, blocker: stopped ? STOPPED() : hide(next.blocker) }, null]
      : macMove(next)
        ? [onMac(place, chain, next), exitBeside ? phoneExit(place, exitBeside, plan, stopped) : null]
        : plan.nothingToShip
          ? [null, null]
          : [
              // Opening the PR is never held up by a stopped fix.
              open ? phoneExit(place, open, plan, false) : phoneExit(place, primary, plan, stopped),
              plan.idlePr || !secondary ? null : phoneExit(place, secondary, plan, stopped)
            ]
  const exits: RemoteExits = {
    primary: first,
    secondary: other,
    // The PR line names a merged or closed PR too (PR #5 · 已关闭), not only an open one.
    pr: found.prStatus?.pr ? { number: found.prStatus.pr.number, state: found.prStatus.pr.state, url: found.prStatus.pr.url } : null,
    base: preflight.ok ? preflight.base : found.changes.base,
    baseProtected: preflight.ok ? preflight.baseProtected : null,
    archive: { blocker: await archiveBlocker(place) }
  }
  return { ok: true, data: exits }
}

async function start(place: Place, kind: 'main' | 'pr' | 'push-pr' | 'push-base'): Promise<RemoteResult> {
  const found = await planFor(place)
  if (!found) return remoteFail(pick(M).notGit)
  const { changes, preflight, plan } = found
  // 推送 of the base is a chain action, not one of the two exits: its own blocker.
  const pushBase = kind === 'push-base' ? plan.chain.actions.find((a) => a.id === 'push-base')! : null
  const exit = pushBase ? null : [plan.exits.primary, plan.exits.secondary].find((e) => e?.kind === kind)
  if (!pushBase && (!exit || plan.nothingToShip)) return remoteFail(pick(M).exitUnavailable)
  if (useShips.getState().byWorktree[place.worktree.path]) return remoteFail(pick(M).exitRunning)
  if (stoppedFix(place.worktree.path, plan.pr?.number ?? null)) return remoteFail(STOPPED())
  const blocker = pushBase ? pushBase.blocker : exit ? plan.blocker(exit) : null
  if (blocker || !preflight.ok) return fail(place, blocker ?? pick(M).checking)
  const { session, worktree, project } = place
  const state = useWorkspace.getState()
  const agent = commentTarget(worktree, state.sessions, state.worktrees, session.id)
  const checks = turnCheckView(agent ? useSessionMeta.getState().bySession[agent.id]?.checks : undefined)
  const settings = await window.tr.settings.get()
  const ctx = shipContextFor({
    projectRoot: project.rootPath,
    worktreePath: worktree.path,
    preflight,
    changes,
    pr: plan.pr,
    agentSession: agent?.id ?? null,
    openIn: session.id,
    checksLine: checks ? pick(M).checksLine(checksText(checks)) : null,
    settings: { review: settings.review, pr: settings.pr }
  })
  // The tip the run starts from and where the base goes: the preflight just read, as the desktop's commands pass it.
  const options = { head: preflight.head, ...(preflight.baseRemote !== undefined ? { baseRemote: preflight.baseRemote } : {}) }
  if (!exit) {
    // 推送 of the base, as Git · 变更 starts it (chain-actions.ts).
    startShip({ ...ctx, paths: null, openPr: null }, 'push-base', CHAIN_LABEL.pushBaseTo(preflight.base), options)
    return { ok: true }
  }
  startShip(
    ctx,
    exit.kind === 'open-pr' ? 'push-pr' : exit.kind,
    // 合并 is local only (its button names no base; the block's title does).
    exit.kind === 'main' ? CHAIN_LABEL.mergeTo(preflight.base) : exit.label,
    options
  )
  return { ok: true }
}

export async function remoteShipAction(sessionId: string, action: RemoteShipAction): Promise<RemoteResult> {
  const place = placeOf(sessionId)
  if (!place) return remoteFail(pick(M).noSession)
  const path = place.worktree.path
  if (action.do === 'start') return start(place, action.exit)
  const state = useShips.getState().byWorktree[path]
  if (!state) return remoteFail(pick(M).exitEnded)
  // The text can be changed while it is shown: at the last look, and after a failed run (Ship block `showFields`).
  const failedInRun = state.error !== null && state.failedIn === 'running'
  switch (action.do) {
    case 'edit':
      if (state.stage !== 'glance' && !failedInRun) return remoteFail(pick(M).cantEdit)
      editShip(path, action.texts)
      return { ok: true }
    case 'submit': {
      if (state.stage !== 'glance' || state.error) return remoteFail(pick(M).notWritten)
      const blocker = submitBlocker(state)
      if (blocker) return remoteFail(blocker)
      submitShip(path)
      return { ok: true }
    }
    case 'retry': {
      if (!state.error) return remoteFail(pick(M).nothingToRetry)
      // The push node's review stopped it: 让 <agent> 修 and 照样推送 are the Mac's buttons, not another review.
      if (state.error.reviewStop) return remoteFail(pick(M).reviewStop)
      const blocker = failedInRun ? submitBlocker(state) : null
      if (blocker) return remoteFail(blocker)
      retryShip(path)
      return { ok: true }
    }
    case 'cancel':
      if (state.stage === 'running' && !state.error) return remoteFail(pick(M).cantCancel)
      cancelShip(path)
      return { ok: true }
    case 'conflicts': {
      if (!state.error?.conflicts) return remoteFail(pick(M).noConflicts)
      const ws = useWorkspace.getState()
      if (!commentTarget(place.worktree, ws.sessions, ws.worktrees, place.session.id)) return remoteFail(pick(M).noAgent)
      await handConflictsToAgent(path)
      return useShips.getState().byWorktree[path] ? fail(place, useShips.getState().byWorktree[path]!.error?.message ?? pick(M).handFailed) : { ok: true }
    }
    case 'switch-pr':
      if (!state.error?.pushRefused) return remoteFail(pick(M).notRefused)
      switchToPr(path)
      return { ok: true }
  }
}

export async function remoteArchive(sessionId: string): Promise<RemoteResult> {
  const place = placeOf(sessionId)
  if (!place) return remoteFail(pick(M).noSession)
  const blocker = await archiveBlocker(place)
  if (blocker) return remoteFail(blocker)
  const target = archiveTargetFor(place.worktree.id)!
  const outcome = await archiveWorktree(target, { unattended: true })
  if (outcome.ok) return { ok: true }
  return fail(place, outcome.stage === 'script' ? pick(M).archiveAnyway(outcome.message) : outcome.message)
}
