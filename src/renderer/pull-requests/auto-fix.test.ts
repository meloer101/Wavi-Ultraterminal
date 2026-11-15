// 自动修复 across a reload, driven against a fake window.tr: the order things arrive in when main is still running.
import { describe, expect, it, vi } from 'vitest'
import type { SavedFixRun } from '@shared/saved-runs'

const saved: SavedFixRun = {
  scope: 'pr',
  worktree: '/repo-wt',
  number: 7,
  run: { kind: 'fixing', sessionId: 's1', key: 'k', checks: ['test'], baseFailing: null, since: 'abc1234', sentAt: 1 }
}
const sessions: Array<Record<string, unknown>> = [{ id: 's1', worktreeId: 'w1', kind: 'claude', title: 'fix', status: 'idle', phase: 'ready', startedAt: 1, lastActivityAt: 1 }]

vi.mock('../state/persistence', () => ({ initialWorkspaceFile: () => ({ fixRuns: [saved] }), addSnapshotPart: () => () => {}, requestSave: () => {} }))
vi.mock('../state/workspace', () => ({
  useWorkspace: {
    getState: () => ({
      sessions,
      worktrees: [
        { id: 'w1', projectId: 'p1', path: '/repo-wt' },
        { id: 'w0', projectId: 'p1', path: '/repo', isMain: true, branch: 'main' }
      ],
      projects: [{ id: 'p1', rootPath: '/repo' }],
      activeSessionId: 's1'
    }),
    subscribe: () => () => {}
  }
}))
vi.mock('../session-io', () => ({ interruptAgent: () => {}, submitPrompt: async () => {} }))
vi.mock('../review/background', () => ({ useBackgroundReview: { getState: () => ({ byRoot: {} }) } }))

describe('自动修复 after a reload (architecture review, batch 6)', () => {
  it('keeps the fix that was under way although the PR status arrives before the settings', async () => {
    let settingsArrive: (value: unknown) => void = () => {}
    vi.stubGlobal('window', {
      tr: {
        settings: { get: () => new Promise((resolve) => (settingsArrive = resolve)), onChange: () => () => {} },
        agent: { onEvent: () => () => {} },
        ship: { onBaseCi: () => () => {}, baseCi: async () => null },
        pr: { setMergeWhenGreen: async () => null },
        ui: { notify: () => {} }
      }
    })
    const { DEFAULT_SETTINGS } = await import('@shared/settings')
    const { startPrAutomation } = await import('./auto-fix')
    const { acceptPrStatus, usePullRequests } = await import('./store')
    const stop = startPrAutomation()
    // main is still up after a reload: the PR's cached status comes back before the settings do.
    acceptPrStatus({
      worktree: '/repo-wt',
      branch: 'feat',
      checkedAt: 1,
      pr: { number: 7, state: 'open', url: 'u', title: 't', checks: { state: 'failing', total: 1, passed: 0, pending: 0, failing: [{ name: 'test', runId: 1, jobId: 1 }] } }
    } as never)
    expect(usePullRequests.getState().automation['/repo-wt']?.run).toMatchObject({ kind: 'stopped', since: 'abc1234', decision: { reason: 'interrupted' } })
    settingsArrive({ ...DEFAULT_SETTINGS, pr: { ...DEFAULT_SETTINGS.pr, autoFix: true } })
    await new Promise((r) => setTimeout(r, 0))
    // The switch follows the default; the run still waits for the user.
    expect(usePullRequests.getState().automation['/repo-wt']).toMatchObject({ autoFix: true, run: { kind: 'stopped' } })
    stop()
    vi.unstubAllGlobals()
  })
})

describe('which agent 自动修复 hands the fix to (every agent with hooks)', () => {
  it('takes a Gemini, Qwen or Pi session as well as Claude and Codex, and names it', async () => {
    const { agentFor, agentName } = await import('./auto-fix')
    const original = sessions.splice(0)
    try {
      sessions.push({ id: 'g1', worktreeId: 'w1', kind: 'gemini', title: 'fix', status: 'idle', phase: 'ready', startedAt: 1, lastActivityAt: 1 })
      expect(agentFor('/repo-wt')?.id).toBe('g1')
      expect(agentName(agentFor('/repo-wt'))).toBe('Gemini CLI')
      sessions.splice(0, 1, { ...sessions[0], kind: 'grok' })
      // No hooks: no Stop to look at the brakes after its turn.
      expect(agentFor('/repo-wt')).toBeNull()
      // Its GUI session reports the turn's end itself (main's status tracker), so it can take a fix.
      sessions.splice(0, 1, { ...sessions[0], kind: 'grok', ui: 'gui' })
      expect(agentName(agentFor('/repo-wt'))).toBe('Grok')
      expect(agentName(null)).toBe('Claude')
    } finally {
      sessions.splice(0, sessions.length, ...original)
    }
  })
})

// 合并 is local only: a fix of the base's CI still lands on the base and is pushed (never reviewed).
describe('自动修复 of the base', () => {
  it('merges the fix into the base and pushes it', async () => {
    const shipToMain = vi.fn(async (_request: unknown) => ({ ok: true, commit: 'f'.repeat(40), pushed: true }))
    vi.stubGlobal('window', {
      tr: {
        ui: { confirm: async () => true, notify: () => {} },
        ship: { shipToMain },
        pr: { refresh: () => {} }
      }
    })
    const { pushAnyway } = await import('./auto-fix')
    const { setBaseAutomation, useBaseCi } = await import('./base-ci')
    const run = { kind: 'stopped' as const, sessionId: 's1', since: 'abc1234', key: 'k', checks: ['test'], baseFailing: null, decision: { kind: 'stop' as const, reason: 'limit' as const } }
    const { freshAutomation } = await import('./auto-fix-model')
    setBaseAutomation('/repo-wt', { ...freshAutomation(0, true), attempts: 1, lastKey: 'k', lastHead: 'abc1234', baseChecked: true, run })
    await pushAnyway('base', '/repo-wt')
    expect(shipToMain).toHaveBeenCalledTimes(1)
    expect(shipToMain.mock.calls[0]![0]).toEqual({ root: '/repo', worktree: '/repo-wt', message: '', paths: null, method: 'squash', push: true })
    expect(useBaseCi.getState().automation['/repo-wt']).toMatchObject({ run: null, pushed: 1, pushedShas: ['f'.repeat(40)] })
    setBaseAutomation('/repo-wt', null)
    vi.unstubAllGlobals()
  })
})

// The push node never reviews a fix's push (its brakes ran): no review starts on any of the three ways a fix is pushed.
describe('自动修复 pushes without the push node\'s review', () => {
  const stoppedRun = { kind: 'stopped' as const, sessionId: 's0', since: 'abc1234', key: 'k', checks: ['test'], baseFailing: null, decision: { kind: 'stop' as const, reason: 'limit' as const } }

  it('pushes a fix of the base from the main checkout on it as a plain 推送 of the base (no merge, no review)', async () => {
    sessions.push({ id: 's0', worktreeId: 'w0', kind: 'claude', title: 'fix', status: 'idle', phase: 'ready', startedAt: 1, lastActivityAt: 1 })
    const pushBase = vi.fn(async (_target: unknown) => ({ ok: true, commit: 'e'.repeat(40), pushed: true }))
    const shipToMain = vi.fn(async (_request: unknown) => ({ ok: true, commit: 'f'.repeat(40), pushed: true }))
    const start = vi.fn(async () => ({ phase: 'running' }))
    vi.stubGlobal('window', {
      tr: { ui: { confirm: async () => true, notify: () => {} }, ship: { shipToMain, pushBase }, pr: { refresh: () => {} }, review: { start } }
    })
    try {
      const { pushAnyway } = await import('./auto-fix')
      const { setBaseAutomation, useBaseCi } = await import('./base-ci')
      const { freshAutomation } = await import('./auto-fix-model')
      useBaseCi.setState((s) => ({ byWorktree: { ...s.byWorktree, '/repo': { worktree: '/repo', base: 'main', sha: 'd'.repeat(40), checks: { state: 'failing', total: 1, passed: 0, pending: 0, failing: [] }, url: null, checkedAt: 1 } } }))
      setBaseAutomation('/repo', { ...freshAutomation(0, true), attempts: 1, lastKey: 'k', lastHead: 'abc1234', baseChecked: true, run: stoppedRun })
      await pushAnyway('base', '/repo')
      expect(pushBase).toHaveBeenCalledWith({ root: '/repo', worktree: '/repo' })
      expect(shipToMain).not.toHaveBeenCalled()
      expect(start).not.toHaveBeenCalled()
      expect(useBaseCi.getState().automation['/repo']).toMatchObject({ run: null, pushed: 1, pushedShas: ['e'.repeat(40)] })
      setBaseAutomation('/repo', null)
    } finally {
      sessions.splice(sessions.findIndex((x) => x.id === 's0'), 1)
      vi.unstubAllGlobals()
    }
  })

  it('tells the main checkout on its base from any other worktree', async () => {
    const { onBaseCheckout } = await import('./auto-fix')
    const worktrees = [
      { path: '/repo', isMain: true, branch: 'main' },
      { path: '/repo-wt', isMain: false, branch: 'main' },
      { path: '/other', isMain: true, branch: 'feat' }
    ]
    expect(onBaseCheckout('/repo', 'main', worktrees)).toBe(true)
    expect(onBaseCheckout('/repo-wt', 'main', worktrees)).toBe(false)
    expect(onBaseCheckout('/other', 'main', worktrees)).toBe(false)
    expect(onBaseCheckout('/repo', null, worktrees)).toBe(false)
  })
})
