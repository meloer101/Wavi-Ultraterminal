// Git · 变更's two exits (PRD F16 v1.78, Figma 29A): 合并 (into the local base) and 创建 PR, which one is primary (the
// repository's remembered choice, else the preflight's suggestion), what each becomes once a PR is open, what blocks
// them, and the run an exit starts. A thin adapter over the merge chain (src/shared/ship-chain.ts, 合入链路 v2): labels
// and blockers come from the chain's actions. The exits ship only what is committed (提交 is a run of its own). Pure;
// Git · 变更 and the phone (PRD F22) both read it.
import type { GitChanges } from '@shared/git-graph/log'
import { defineMessages, pick } from '@shared/i18n'
import { livePr, unpushedOf, type GhState, type PrStatus, type PullRequestInfo } from '@shared/pull-requests'
import type { AppSettings } from '@shared/settings'
import type { ShipExitKind, ShipPreflight } from '@shared/ship'
import { chainInputFrom, onOwnBase, shipChain, type ChainActionId, type ChainInput, type ChainState } from '@shared/ship-chain'
import type { Session, SessionId } from '@shared/types'
import type { ShipContext } from './ship-runner'

export { livePr, unpushedOf }

const M = defineMessages({
  zh: { openPr: (number: number) => `打开 PR #${number}` },
  en: { openPr: (number: number) => `Open PR #${number}` }
})

export type ShipExit =
  | { kind: 'main'; label: string; blocker: string | null }
  | { kind: 'pr'; label: string; blocker: string | null }
  /** The branch has an open PR and commits to push to it. */
  | { kind: 'push-pr'; number: number; label: string; blocker: string | null }
  /** The branch has an open PR and nothing to send. */
  | { kind: 'open-pr'; number: number; label: string; blocker: null }

export interface ExitState {
  preflight: ShipPreflight | null
  /** This repository's last used exit (renderer-remembered), null when never used. */
  remembered: ShipExitKind | null
  /** The open PR's head differs from the local head and the PR has nothing the branch lacks. */
  unpushed: boolean
}

type Exits = { primary: ShipExit; secondary: ShipExit | null }

/** The exits as the chain's `main` and `pr` actions, in the order the footer shows them. */
function exitsOf(chain: ChainState, input: ChainInput): Exits {
  const slot = (id: ChainActionId) => chain.actions.find((a) => a.id === id)!
  const main: ShipExit = { kind: 'main', label: slot('main').label, blocker: slot('main').blocker }
  const pr: ShipExit = { kind: 'pr', label: slot('pr').label, blocker: slot('pr').blocker }
  const both = (first: ShipExitKind): Exits => (first === 'main' ? { primary: main, secondary: pr } : { primary: pr, secondary: main })
  const { preflight } = input
  if (preflight === null) return both(input.remembered ?? 'main')
  if (!preflight.ok) return both('main')
  if (input.pr) {
    const { number } = input.pr
    // The chain's own count: the PR poll can lag behind the preflight's remote branch. Uncommitted files are not
    // something to push: 提交 commits them first.
    if (chain.unpushed) return { primary: { kind: 'push-pr', number, label: pr.label, blocker: pr.blocker }, secondary: null }
    return { primary: { kind: 'open-pr', number, label: pick(M).openPr(number), blocker: null }, secondary: null }
  }
  if (preflight.remote === null || preflight.remoteOnGitHub === false) return { primary: main, secondary: null }
  return both(input.remembered ?? preflight.suggested)
}

/** The footer's primary exit and the other one (null when only one applies). */
export function shipExits(state: ExitState): Exits {
  const { preflight, remembered, unpushed } = state
  const ok = preflight?.ok ? preflight : null
  const input: ChainInput = {
    preflight,
    remembered,
    local: { branch: ok?.branch ?? null, base: ok?.base ?? null, ahead: ok?.ahead ?? 0, uncommitted: ok?.uncommitted ?? 0, trackedUncommitted: ok?.uncommitted ?? 0 },
    pr: ok?.openPr != null ? { number: ok.openPr, draft: false, unpushed, remoteAhead: false, details: true, conflicting: false } : null,
    prMerged: false,
    isMain: false,
    // shipExits has no worktree to place: the plan (exitPlan) adds the project and base blockers.
    projectRoot: '/',
    gh: null,
    agent: null,
    sessions: [],
    radarConflicts: null
  }
  return exitsOf(shipChain(input), input)
}

export interface ExitInput {
  preflight: ShipPreflight | null
  remembered: ShipExitKind | null
  prStatus: PrStatus | null
  changes: Pick<GitChanges, 'branch' | 'base' | 'ahead' | 'uncommitted' | 'untrackedOmitted'> & Partial<Pick<GitChanges, 'baseRef'>>
  /** The worktree is the project's main checkout. */
  isMain: boolean
  /** The worktree's project root; null when the worktree has no project. */
  projectRoot: string | null
  /** gh as the renderer store knows it (newer than the preflight's); omitted: the preflight's. */
  gh?: GhState | null
  /** The display name of the worktree's agent session (the chain's 交给 …). */
  agent?: string | null
  /** The worktree's sessions (the chain's 归档…). */
  sessions?: readonly Pick<Session, 'status'>[]
  /** The conflict radar's files against the base. */
  radarConflicts?: readonly string[] | null
  /** Ticked uncommitted files (Git · 变更's checkboxes, which the phone honours too); omitted: every one. */
  ticked?: number
}

export interface ExitPlan {
  /** The merge chain the exits are read from. */
  chain: ChainState
  exits: Exits
  /** The branch's open PR. */
  pr: PullRequestInfo | null
  unpushed: boolean
  onBase: boolean
  /** Nothing to propose or merge (merged already — pushed or not —, or no work yet): no exits; the PR line says what
   *  happened. */
  nothingToShip: boolean
  /** A PR is open and there is nothing to push: open it, or merge it. */
  idlePr: PullRequestInfo | null
  /** Why an exit cannot run now (UI copy), or null. */
  blocker(exit: ShipExit): string | null
}

export function exitPlan(input: ExitInput): ExitPlan {
  const { prStatus, changes, isMain } = input
  const chainInput = chainInputFrom(input)
  const chain = shipChain(chainInput)
  const pr = livePr(prStatus)
  // The chain's: the PR poll's, or commits the preflight's remote branch lacks.
  const unpushed = chain.unpushed
  const clean = changes.uncommitted.length === 0 && changes.untrackedOmitted === 0
  return {
    chain,
    exits: exitsOf(chain, chainInput),
    pr,
    unpushed,
    onBase: onOwnBase(isMain, changes),
    // Merged into the local base and waiting for 推送 of the base: nothing to propose or merge either.
    nothingToShip: chain.stage === 'merged' || chain.stage === 'unpushed' || chain.stage === 'empty',
    idlePr: pr && !unpushed && clean ? pr : null,
    // The chain's own blocker (an operation, the base, no project, checking, a failed preflight) holds every exit,
    // an open-PR exit the caller built too.
    blocker: (exit) => chain.blocked ?? exit.blocker
  }
}

/** The run a chain action starts (ship-runner.ts), from what Git · 变更 (or the phone) knows about the worktree. */
export function shipContextFor(input: {
  projectRoot: string
  worktreePath: string
  /** The preflight just read. A failed one (the main checkout on its base) only starts 提交, whose run names the branch
   *  from the change list. */
  preflight: ShipPreflight | null
  changes: Pick<GitChanges, 'branch' | 'base'>
  pr: PullRequestInfo | null
  /** The worktree's agent session (it writes the text). */
  agentSession: SessionId | null
  /** The session whose built-in browser opens the PR. */
  openIn: SessionId | null
  checksLine: string | null
  settings: Pick<AppSettings, 'review' | 'pr'>
  /** 提交's ticked 未提交 paths (the Mac's checkboxes); the exits ship what is committed and take none. */
  paths?: readonly string[]
}): ShipContext {
  const ok = input.preflight?.ok ? input.preflight : null
  const branch = ok?.branch ?? input.changes.branch ?? ''
  return {
    root: input.projectRoot,
    worktree: input.worktreePath,
    sessionId: input.agentSession,
    base: ok?.base ?? input.changes.base ?? branch,
    branch,
    remote: ok?.remote ?? null,
    paths: input.paths && input.paths.length > 0 ? [...input.paths] : null,
    openPr: input.pr ? { number: input.pr.number, url: input.pr.url } : null,
    checksLine: input.checksLine,
    settings: input.settings,
    openIn: input.openIn
  }
}
