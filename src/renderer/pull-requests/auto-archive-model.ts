// 合并后自动归档 (设置 · Worktree · 归档, PRD F15): a worktree is archived by itself once its merge chain reaches 归档 — path
// ③ as soon as the branch's PR, which this window saw open, is merged or closed on GitHub; path ② once a 推送 of the
// base this window made went through and that commit's CI on the base settled (no check running, no 自动修复 under way;
// a CI that never answers, or none at all, counts as settled after a bound). Never while one of its sessions runs or
// waits on the user, never the main checkout, once per event. Pure apart from the deps the caller passes
// (pull-requests/auto-archive.ts wires them to the stores, the chain and archiveWorktree).
import { archiveBlocker } from '@shared/archive'
import { defineMessages, pick } from '@shared/i18n'
import type { PrState } from '@shared/pull-requests'
import type { BaseCi } from '@shared/ship'
import type { ChainState } from '@shared/ship-chain'
import type { Session } from '@shared/types'
import type { BasePush } from './base-ci'

const M = defineMessages({
  zh: { notArchived: (message: string) => `没有自动归档：${message}` },
  en: { notArchived: (message: string) => `Not archived automatically: ${message}` }
})

export const AUTO_ARCHIVE = {
  /** A 推送 of the base whose CI never answered (not on GitHub, gh not ready, no checks registered): settled after this. */
  noCiMs: 3 * 60_000,
  /** A CI on the base still running this long after the push: settled (it may never finish). */
  pendingMaxMs: 60 * 60_000,
  /** The chain read again at most this often while it does not stand at 归档. */
  recheckMs: 30_000
} as const

/** What armed a worktree: its PR merged or closed on GitHub (path ③), or a 推送 of the base (path ②). */
export type AutoArchiveCause = { kind: 'pr'; number: number } | { kind: 'base'; push: BasePush }

/** What the stores say about one worktree now. */
export interface AutoArchiveView {
  /** 合并后自动归档; null while the settings are not read yet. */
  on: boolean | null
  /** A workspace worktree that is not archived. */
  present: boolean
  isMain: boolean
  sessions: readonly Pick<Session, 'status'>[]
  /** A Ship run is open on it. */
  shipping: boolean
  /** The latest CI of a base commit it pushed. */
  ci: Pick<BaseCi, 'sha' | 'checks' | 'checkedAt'> | null
  /** 自动修复 of the base is under way, stopped for the user, or about to send. */
  fixing: boolean
}

/** `read`: read the chain and archive when it stands at 归档; `wait`: again on the next change, or at `until`; `drop`:
 *  never for this cause. */
export type AutoArchiveCall = { kind: 'read' } | { kind: 'wait'; until: number | null } | { kind: 'drop' }

export function autoArchiveCall(cause: AutoArchiveCause, view: AutoArchiveView, now: number): AutoArchiveCall {
  if (view.on === false || !view.present || view.isMain) return { kind: 'drop' }
  if (view.on === null || view.shipping || archiveBlocker(view.sessions, false) !== null) return { kind: 'wait', until: null }
  if (cause.kind === 'pr') return { kind: 'read' }
  const { push } = cause
  if (view.fixing) return { kind: 'wait', until: null }
  // The pushed commit's CI, or a later one's (a fix 自动修复 pushed on top).
  const ci = view.ci && (view.ci.sha === push.sha || view.ci.checkedAt >= push.at) ? view.ci : null
  const until = push.at + (ci ? AUTO_ARCHIVE.pendingMaxMs : AUTO_ARCHIVE.noCiMs)
  if (ci && ci.checks.state !== 'pending') return { kind: 'read' }
  return now >= until ? { kind: 'read' } : { kind: 'wait', until }
}

/** The chain, read fresh, stands at 归档 and it can run. */
export const chainAtArchive = (chain: Pick<ChainState, 'next'> | null): boolean => chain?.next?.id === 'archive' && chain.next.blocker === null

export interface AutoArchiveDeps {
  view(worktree: string): AutoArchiveView
  /** The worktree's chain from a fresh change list and preflight; null when it cannot be read. */
  readChain(worktree: string): Promise<ChainState | null>
  archive(worktree: string): Promise<{ ok: true } | { ok: false; message: string }>
  /** Says why an automatic archive did not happen (Git · 变更's notice line). */
  say(worktree: string, text: string): void
  now(): number
  /** Runs `run` after `ms`; returns the cancel. */
  later(run: () => void, ms: number): () => void
}

export interface AutoArchiver {
  /** A PR status of the worktree: an open PR is remembered; that PR merged or closed arms the worktree. */
  pr(worktree: string, pr: { number: number; state: PrState } | null): void
  /** A 推送 of the base went through from the worktree. */
  basePush(worktree: string, push: BasePush): void
  evaluate(worktree: string): void
  evaluateAll(): void
  armed(): ReadonlyMap<string, AutoArchiveCause>
  stop(): void
}

export function createAutoArchiver(deps: AutoArchiveDeps): AutoArchiver {
  const armed = new Map<string, AutoArchiveCause>()
  /** The open PR each worktree had when last seen: only its merge or close arms (not one merged before this window). */
  const openSeen = new Map<string, number>()
  const reading = new Set<string>()
  const lastRead = new Map<string, number>()
  const timers = new Map<string, () => void>()

  const clearTimer = (worktree: string): void => {
    timers.get(worktree)?.()
    timers.delete(worktree)
  }
  const at = (worktree: string, when: number): void => {
    clearTimer(worktree)
    timers.set(
      worktree,
      deps.later(() => {
        timers.delete(worktree)
        evaluate(worktree)
      }, Math.max(0, when - deps.now()))
    )
  }

  function evaluate(worktree: string): void {
    const cause = armed.get(worktree)
    if (!cause) return
    clearTimer(worktree)
    const now = deps.now()
    const call = autoArchiveCall(cause, deps.view(worktree), now)
    if (call.kind === 'drop') {
      armed.delete(worktree)
      return
    }
    if (call.kind === 'wait') {
      if (call.until !== null) at(worktree, call.until)
      return
    }
    if (reading.has(worktree)) return
    const last = lastRead.get(worktree)
    if (last !== undefined && now - last < AUTO_ARCHIVE.recheckMs) {
      at(worktree, last + AUTO_ARCHIVE.recheckMs)
      return
    }
    reading.add(worktree)
    lastRead.set(worktree, now)
    void deps
      .readChain(worktree)
      .catch(() => null)
      .then((chain) => {
        reading.delete(worktree)
        if (armed.get(worktree) !== cause) return
        // Still checking (the preflight answered an older change list): read again soon. Otherwise the next change does.
        if (!chainAtArchive(chain)) {
          if (chain?.stage === 'checking') at(worktree, deps.now() + AUTO_ARCHIVE.recheckMs)
          return
        }
        // A session may have started while the chain was read.
        if (autoArchiveCall(cause, deps.view(worktree), deps.now()).kind !== 'read') return evaluate(worktree)
        armed.delete(worktree)
        lastRead.delete(worktree)
        void deps
          .archive(worktree)
          .catch((error: unknown) => ({ ok: false as const, message: error instanceof Error ? error.message : String(error) }))
          .then((outcome) => {
            if (!outcome.ok) deps.say(worktree, pick(M).notArchived(outcome.message))
          })
      })
  }

  return {
    pr(worktree, pr) {
      if (!pr) return
      if (pr.state === 'open' || pr.state === 'draft') {
        openSeen.set(worktree, pr.number)
        // Reopened: the close no longer stands.
        if (armed.get(worktree)?.kind === 'pr') armed.delete(worktree)
        return
      }
      if (openSeen.get(worktree) === pr.number) {
        openSeen.delete(worktree)
        armed.set(worktree, { kind: 'pr', number: pr.number })
        lastRead.delete(worktree)
      }
      evaluate(worktree)
    },
    basePush(worktree, push) {
      const current = armed.get(worktree)
      if (current?.kind === 'base' && current.push.sha === push.sha && current.push.at === push.at) return evaluate(worktree)
      armed.set(worktree, { kind: 'base', push })
      lastRead.delete(worktree)
      evaluate(worktree)
    },
    evaluate,
    evaluateAll() {
      for (const worktree of [...armed.keys()]) evaluate(worktree)
    },
    armed: () => armed,
    stop() {
      for (const cancel of timers.values()) cancel()
      timers.clear()
      armed.clear()
    }
  }
}
