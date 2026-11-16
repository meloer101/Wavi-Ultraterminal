import { describe, expect, it } from 'vitest'
import type { ChainState } from '@shared/ship-chain'
import type { ChecksSummary } from '@shared/pull-requests'
import { AUTO_ARCHIVE, autoArchiveCall, chainAtArchive, createAutoArchiver, type AutoArchiveView } from './auto-archive-model'

const view = (over: Partial<AutoArchiveView> = {}): AutoArchiveView => ({
  on: true,
  present: true,
  isMain: false,
  sessions: [{ status: 'idle' }],
  shipping: false,
  ci: null,
  fixing: false,
  ...over
})
const checks = (state: ChecksSummary['state']): ChecksSummary => ({ state, total: 1, passed: state === 'passing' ? 1 : 0, pending: state === 'pending' ? 1 : 0, failing: [] })
const atArchive = { stage: 'merged', next: { id: 'archive', label: '归档…', blocker: null } } as unknown as ChainState
const atExits = { stage: 'exits', next: { id: 'main', label: '合并', blocker: null } } as unknown as ChainState

/** An archiver over fake deps; `tick` runs the pending timers that are due, `flush` the promise callbacks. */
function harness(over: { view?: () => AutoArchiveView; chain?: () => ChainState | null } = {}) {
  let now = 1_000
  let current = view()
  const archived: string[] = []
  const said: string[] = []
  const timers: Array<{ at: number; run: () => void; live: boolean }> = []
  let reads = 0
  const archiver = createAutoArchiver({
    view: over.view ?? (() => current),
    readChain: async () => {
      reads++
      return over.chain ? over.chain() : atArchive
    },
    archive: async (worktree) => {
      archived.push(worktree)
      return { ok: true }
    },
    say: (_w, text) => said.push(text),
    now: () => now,
    later: (run, ms) => {
      const timer = { at: now + ms, run, live: true }
      timers.push(timer)
      return () => (timer.live = false)
    }
  })
  const flush = () => new Promise((r) => setTimeout(r, 0))
  return {
    archiver,
    archived,
    said,
    reads: () => reads,
    flush,
    set: (next: Partial<AutoArchiveView>) => (current = view({ ...current, ...next })),
    async advance(ms: number) {
      now += ms
      for (const t of timers.splice(0)) {
        if (t.live && t.at <= now) t.run()
        else if (t.live) timers.push(t)
      }
      await flush()
    }
  }
}

describe('autoArchiveCall', () => {
  const pr = { kind: 'pr', number: 7 } as const
  const base = { kind: 'base', push: { sha: 'a'.repeat(40), at: 0 } } as const

  it('archives a merged or closed PR straight away, never while a session runs or waits, never the main checkout', () => {
    expect(autoArchiveCall(pr, view(), 0)).toEqual({ kind: 'read' })
    expect(autoArchiveCall(pr, view({ sessions: [{ status: 'running' }] }), 0)).toEqual({ kind: 'wait', until: null })
    expect(autoArchiveCall(pr, view({ sessions: [{ status: 'needs_you' }] }), 0)).toEqual({ kind: 'wait', until: null })
    expect(autoArchiveCall(pr, view({ isMain: true }), 0)).toEqual({ kind: 'drop' })
    expect(autoArchiveCall(pr, view({ on: false }), 0)).toEqual({ kind: 'drop' })
    expect(autoArchiveCall(pr, view({ on: null }), 0)).toEqual({ kind: 'wait', until: null })
    expect(autoArchiveCall(pr, view({ present: false }), 0)).toEqual({ kind: 'drop' })
    expect(autoArchiveCall(pr, view({ shipping: true }), 0)).toEqual({ kind: 'wait', until: null })
  })

  it('waits for the pushed commit’s CI on the base to settle (path ②)', () => {
    const sha = base.push.sha
    // CI running: until it stops, or the bound passes.
    expect(autoArchiveCall(base, view({ ci: { sha, checks: checks('pending'), checkedAt: 5 } }), 10)).toEqual({ kind: 'wait', until: AUTO_ARCHIVE.pendingMaxMs })
    expect(autoArchiveCall(base, view({ ci: { sha, checks: checks('pending'), checkedAt: 5 } }), AUTO_ARCHIVE.pendingMaxMs)).toEqual({ kind: 'read' })
    for (const state of ['passing', 'failing', 'none'] as const) expect(autoArchiveCall(base, view({ ci: { sha, checks: checks(state), checkedAt: 5 } }), 10)).toEqual({ kind: 'read' })
    // 自动修复 under way (or about to send): wait.
    expect(autoArchiveCall(base, view({ ci: { sha, checks: checks('failing'), checkedAt: 5 }, fixing: true }), 10)).toEqual({ kind: 'wait', until: null })
    // No answer about it at all (no CI, not GitHub): settled after the bound.
    expect(autoArchiveCall(base, view(), 10)).toEqual({ kind: 'wait', until: AUTO_ARCHIVE.noCiMs })
    expect(autoArchiveCall(base, view(), AUTO_ARCHIVE.noCiMs)).toEqual({ kind: 'read' })
    // An older push's CI does not count; a fix's newer commit does.
    expect(autoArchiveCall({ kind: 'base', push: { sha, at: 100 } }, view({ ci: { sha: 'b'.repeat(40), checks: checks('passing'), checkedAt: 50 } }), 110)).toEqual({ kind: 'wait', until: 100 + AUTO_ARCHIVE.noCiMs })
    expect(autoArchiveCall({ kind: 'base', push: { sha, at: 100 } }, view({ ci: { sha: 'b'.repeat(40), checks: checks('passing'), checkedAt: 150 } }), 160)).toEqual({ kind: 'read' })
  })

  it('reads the chain at 归档 only when its primary is 归档 and can run', () => {
    expect(chainAtArchive(atArchive)).toBe(true)
    expect(chainAtArchive(atExits)).toBe(false)
    expect(chainAtArchive({ next: { id: 'archive', label: '归档…', blocker: '会话还在运行，先停下来再归档' } })).toBe(false)
    expect(chainAtArchive(null)).toBe(false)
  })
})

describe('createAutoArchiver · path ③', () => {
  it('archives once when the PR it saw open is merged', async () => {
    const h = harness()
    h.archiver.pr('/wt', { number: 7, state: 'open' })
    await h.flush()
    expect(h.archived).toEqual([])
    h.archiver.pr('/wt', { number: 7, state: 'merged' })
    await h.flush()
    expect(h.archived).toEqual(['/wt'])
    // The next poll says merged again: nothing more.
    h.archiver.pr('/wt', { number: 7, state: 'merged' })
    await h.flush()
    expect(h.archived).toEqual(['/wt'])
  })

  it('archives a closed PR too, but not one already merged or closed before this window saw it open', async () => {
    const h = harness()
    h.archiver.pr('/old', { number: 3, state: 'merged' })
    h.archiver.pr('/wt', { number: 7, state: 'draft' })
    h.archiver.pr('/wt', { number: 7, state: 'closed' })
    await h.flush()
    expect(h.archived).toEqual(['/wt'])
  })

  it('waits while a session runs, then archives once it stops', async () => {
    const h = harness()
    h.set({ sessions: [{ status: 'running' }] })
    h.archiver.pr('/wt', { number: 7, state: 'open' })
    h.archiver.pr('/wt', { number: 7, state: 'merged' })
    await h.flush()
    expect(h.archived).toEqual([])
    expect(h.reads()).toBe(0)
    h.set({ sessions: [{ status: 'done_unread' }] })
    h.archiver.evaluateAll()
    await h.flush()
    expect(h.archived).toEqual(['/wt'])
  })

  it('does nothing when the chain is not at 归档 (a reused branch, uncommitted files), nor with the setting off', async () => {
    const h = harness({ chain: () => atExits })
    h.archiver.pr('/wt', { number: 7, state: 'open' })
    h.archiver.pr('/wt', { number: 7, state: 'closed' })
    await h.flush()
    expect(h.archived).toEqual([])
    const off = harness()
    off.set({ on: false })
    off.archiver.pr('/wt', { number: 7, state: 'open' })
    off.archiver.pr('/wt', { number: 7, state: 'merged' })
    await off.flush()
    expect(off.archived).toEqual([])
    expect(off.archiver.armed().size).toBe(0)
  })

  it('forgets a close once the PR is reopened', async () => {
    const h = harness()
    h.set({ sessions: [{ status: 'running' }] })
    h.archiver.pr('/wt', { number: 7, state: 'open' })
    h.archiver.pr('/wt', { number: 7, state: 'closed' })
    h.archiver.pr('/wt', { number: 7, state: 'open' })
    h.set({ sessions: [] })
    h.archiver.evaluateAll()
    await h.flush()
    expect(h.archived).toEqual([])
  })

  it('says why when the archive did not go through', async () => {
    const said: string[] = []
    const archiver = createAutoArchiver({
      view: () => view(),
      readChain: async () => atArchive,
      archive: async () => ({ ok: false, message: '这个仓库的 archive 脚本要先在 Mac 上批准一次' }),
      say: (_w, text) => said.push(text),
      now: () => 0,
      later: () => () => {}
    })
    archiver.pr('/wt', { number: 7, state: 'open' })
    archiver.pr('/wt', { number: 7, state: 'merged' })
    await new Promise((r) => setTimeout(r, 0))
    expect(said).toEqual(['没有自动归档：这个仓库的 archive 脚本要先在 Mac 上批准一次'])
  })
})

describe('createAutoArchiver · path ②', () => {
  it('waits for the base CI to settle after 推送 of the base, then archives', async () => {
    const h = harness()
    const sha = 'c'.repeat(40)
    h.set({ ci: { sha, checks: checks('pending'), checkedAt: 1_000 } })
    h.archiver.basePush('/wt', { sha, at: 1_000 })
    await h.flush()
    expect(h.archived).toEqual([])
    h.set({ ci: { sha, checks: checks('passing'), checkedAt: 2_000 } })
    h.archiver.evaluateAll()
    await h.flush()
    expect(h.archived).toEqual(['/wt'])
  })

  it('archives after the bound when no CI ever answers', async () => {
    const h = harness()
    h.archiver.basePush('/wt', { sha: 'd'.repeat(40), at: 1_000 })
    await h.flush()
    expect(h.archived).toEqual([])
    await h.advance(AUTO_ARCHIVE.noCiMs)
    expect(h.archived).toEqual(['/wt'])
  })

  it('waits while 自动修复 works on a failing base', async () => {
    const h = harness()
    const sha = 'e'.repeat(40)
    h.set({ ci: { sha, checks: checks('failing'), checkedAt: 1_000 }, fixing: true })
    h.archiver.basePush('/wt', { sha, at: 1_000 })
    await h.advance(AUTO_ARCHIVE.pendingMaxMs)
    expect(h.archived).toEqual([])
    h.set({ fixing: false })
    h.archiver.evaluateAll()
    await h.flush()
    expect(h.archived).toEqual(['/wt'])
  })
})
