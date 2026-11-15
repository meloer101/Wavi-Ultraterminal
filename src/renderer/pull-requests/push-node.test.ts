// The push node (pull first → pre-push review → push) driven against a fake window.tr: which commits the review reads
// for each push, a P0 / P1 that stops the push and its two ways on, P2 / P3 that do not, and path ①'s protected base.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/settings'
import type { ReviewComment } from '@shared/review-comments'
import type { ShipMainResult } from '@shared/ship'
import { WAVI_TEXT_MARK } from '@shared/ship-chain'

vi.mock('../lifecycle/agent-up', () => ({ ensureAgentUp: async () => true }))

/** The worktree's review as the window keeps it, and the findings it landed in Git · 变更. */
const reviews: { byRoot: Record<string, { phase: string; agent: string; message: string }> } = { byRoot: {} }
const landed: Record<string, ReviewComment[]> = {}
/** What the next review finds. */
let nextFindings: Array<Pick<ReviewComment, 'severity' | 'text'>> = []
const startBackgroundReview = vi.fn(async (root: string, agent: string, _trigger: string, _base?: string, _force?: boolean, _range?: unknown) => {
  landed[root] = nextFindings.map((f, i) => ({
    id: `f${i}`,
    root,
    path: 'src/a.ts',
    line: i + 1,
    endLine: i + 1,
    side: 'new',
    group: 'committed',
    code: '',
    text: f.text,
    createdAt: i,
    origin: 'review',
    ...(f.severity ? { severity: f.severity } : {})
  })) as ReviewComment[]
  reviews.byRoot[root] = { phase: 'done', agent, message: '看过了' }
})
vi.mock('../review/background', () => ({
  cancelBackgroundReview: () => {},
  startBackgroundReview: (...args: Parameters<typeof startBackgroundReview>) => startBackgroundReview(...args),
  useBackgroundReview: { getState: () => reviews, subscribe: () => () => {} }
}))
vi.mock('../state/review-comments', () => ({
  commentsOf: (root: string) => landed[root] ?? [],
  removeComments: (root: string, ids: ReadonlySet<string>) => {
    landed[root] = (landed[root] ?? []).filter((c) => !ids.has(c.id))
  }
}))
const inserted: Array<{ id: string; text: string }> = []
vi.mock('../session-io', () => ({
  insertIntoTerminal: async (id: string, text: string) => void inserted.push({ id, text }),
  submitPrompt: async () => {}
}))
const workspace: { sessions: Array<{ id: string; kind: string; status: string; worktreeId: string }>; activeSessionId: string | null } = { sessions: [], activeSessionId: null }
vi.mock('../state/workspace', () => ({
  useWorkspace: {
    getState: () => ({ ...workspace, setActiveSession: () => {}, requestTerminalFocus: () => {} }),
    subscribe: () => () => {}
  }
}))
vi.mock('./actions', () => ({ openPullRequest: () => {} }))
vi.mock('./store', () => ({ setPrNotice: () => {} }))

const { cancelShip, handConflictsToAgent, handFindingsToAgent, pushPastReview, retryShip, startShip, useShips } = await import('./ship-runner')
const { failureWay, prePushReview } = await import('./ship-flow')

const prepush = vi.fn<(request: { push: string }) => Promise<unknown>>()
const pushBase = vi.fn<(target: unknown) => Promise<ShipMainResult>>()
const push = vi.fn<(target: unknown) => Promise<unknown>>()
const range = { from: 'a'.repeat(40), to: 'b'.repeat(40) }

const ctx = {
  root: '/repo',
  worktree: '/repo-wt',
  sessionId: 's1',
  base: 'main',
  branch: 'feat',
  remote: 'origin',
  paths: null,
  openPr: null,
  checksLine: null,
  settings: { review: { ...DEFAULT_SETTINGS.review, mode: 'builtin' as const, beforePush: true }, pr: DEFAULT_SETTINGS.pr },
  openIn: null
}
/** Path ①: the main checkout on its base. */
const onBase = { ...ctx, worktree: '/repo', branch: 'main' }

const state = (worktree = ctx.worktree) => useShips.getState().byWorktree[worktree]
const settle = async (): Promise<void> => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0))
}

beforeEach(() => {
  cancelShip(ctx.worktree)
  cancelShip(onBase.worktree)
  reviews.byRoot = {}
  for (const key of Object.keys(landed)) delete landed[key]
  nextFindings = []
  startBackgroundReview.mockClear()
  inserted.length = 0
  workspace.sessions = [{ id: 's1', kind: 'codex', status: 'idle', worktreeId: 'w1' }]
  prepush.mockReset()
  prepush.mockResolvedValue({ ok: true, pulled: null, range, commits: 3 })
  pushBase.mockReset()
  pushBase.mockResolvedValue({ ok: true, commit: 'c'.repeat(40), pushed: true })
  push.mockReset()
  push.mockResolvedValue({ ok: true, outcome: 'pushed', message: '已推送到 origin/feat' })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
  vi.stubGlobal('window', {
    tr: {
      pr: { push, cancelWrite: () => {}, refresh: () => {}, draft: async () => ({ ok: false }) },
      ship: { prepush, pushBase, preflight: async () => ({ ok: false, message: 'x' }), handoff: async () => ({ ok: true, path: '/x/pr.md' }), readHandoff: async () => null },
      agent: { onEvent: () => () => {} },
      app: { detectAgents: async () => ({ claude: true, codex: true }) },
      ui: { notify: () => {} }
    }
  })
})

describe('the review reads what each push sends', () => {
  it('pulls first for every push and reviews only the range main answered', async () => {
    for (const [kind, expected] of [
      ['push-base', 'base'],
      ['push-pr', 'branch'],
      ['pr', 'new-pr']
    ] as const) {
      prepush.mockClear()
      startBackgroundReview.mockClear()
      startShip(ctx, kind, kind)
      await settle()
      expect(prepush).toHaveBeenCalledWith({ root: '/repo', worktree: '/repo-wt', push: expected })
      expect(startBackgroundReview).toHaveBeenCalledTimes(1)
      expect(startBackgroundReview.mock.calls[0]).toEqual(['/repo-wt', 'codex', 'push', 'main', false, range])
      cancelShip(ctx.worktree)
    }
  })

  it('shows the pull only when it brought something in, before the review', async () => {
    prepush.mockResolvedValueOnce({ ok: true, pulled: { from: 'origin/main', commits: 2 }, range, commits: 1 })
    startShip(ctx, 'push-base', '推送 main')
    await settle()
    expect(pushBase).toHaveBeenCalledTimes(1)
    // The block finished: what it showed is gone; the order is checked on a run the review stops.
    prepush.mockResolvedValueOnce({ ok: true, pulled: { from: 'origin/main', commits: 2 }, range, commits: 1 })
    nextFindings = [{ severity: 'P1', text: '越界' }]
    startShip(ctx, 'push-base', '推送 main')
    await settle()
    expect(state()!.steps.map((s) => [s.id, s.label, s.state])).toEqual([
      ['sync', '拉取 origin/main', 'done'],
      ['review', 'Codex 审阅 1 个提交', 'failed'],
      ['push', '推送 origin/main', 'pending']
    ])
  })

  it('reviews nothing when the push sends nothing new', async () => {
    prepush.mockResolvedValueOnce({ ok: true, pulled: null, range: null, commits: 0 })
    startShip(ctx, 'push-pr', '推送')
    await settle()
    expect(startBackgroundReview).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledTimes(1)
  })
})

describe('a P0 / P1 stops the push', () => {
  it('stops before pushing, with 让 <agent> 修 and 照样推送 as the ways on', async () => {
    nextFindings = [
      { severity: 'P1', text: '越界' },
      { severity: 'P3', text: '命名' }
    ]
    startShip(ctx, 'push-base', '推送 main')
    await settle()
    expect(pushBase).not.toHaveBeenCalled()
    expect(state()!.error).toMatchObject({ step: 'review', reviewStop: true, message: '1 个 P1 · 1 个 P3，没有推送' })
    expect(failureWay(state()!.error!)).toEqual({ kind: 'review' })
    // Not another review: 重试 does nothing here.
    retryShip(ctx.worktree)
    await settle()
    expect(startBackgroundReview).toHaveBeenCalledTimes(1)
  })

  it('照样推送 pushes without reviewing again', async () => {
    nextFindings = [{ severity: 'P0', text: '删库' }]
    startShip(ctx, 'push-pr', '推送')
    await settle()
    expect(push).not.toHaveBeenCalled()
    pushPastReview(ctx.worktree)
    await settle()
    expect(push).toHaveBeenCalledTimes(1)
    expect(startBackgroundReview).toHaveBeenCalledTimes(1)
    expect(prepush).toHaveBeenCalledTimes(1)
    expect(state()).toBeUndefined()
  })

  it('让 <agent> 修 puts the P0 / P1 findings into the input line and ends the run, pushing nothing', async () => {
    nextFindings = [
      { severity: 'P1', text: '越界' },
      { severity: 'P3', text: '命名' }
    ]
    startShip(ctx, 'push-base', '推送 main')
    await settle()
    await handFindingsToAgent(ctx.worktree)
    expect(inserted).toHaveLength(1)
    expect(inserted[0]!.id).toBe('s1')
    expect(inserted[0]!.text.startsWith(WAVI_TEXT_MARK)).toBe(true)
    expect(inserted[0]!.text).toContain('越界')
    expect(inserted[0]!.text).not.toContain('命名')
    expect(state()).toBeUndefined()
    expect(pushBase).not.toHaveBeenCalled()
    // The findings that went leave Git · 变更; the P3 stays.
    expect(landed[ctx.worktree]!.map((c) => c.text)).toEqual(['命名'])
  })

  it('goes on past P2 / P3 only, saying how many', async () => {
    nextFindings = [
      { severity: 'P3', text: 'a' },
      { severity: 'P3', text: 'b' }
    ]
    prepush.mockResolvedValueOnce({ ok: true, pulled: null, range, commits: 3 })
    let seen: unknown = null
    pushBase.mockImplementationOnce(async () => {
      seen = state()!.steps.find((s) => s.id === 'review')
      return { ok: true, commit: 'c'.repeat(40), pushed: true }
    })
    startShip(ctx, 'push-base', '推送 main')
    await settle()
    expect(pushBase).toHaveBeenCalledTimes(1)
    expect(seen).toMatchObject({ label: 'Codex 审阅 3 个提交', state: 'done', note: '2 个 P3' })
  })

  it('does not stop the push when the review fails', async () => {
    startBackgroundReview.mockImplementationOnce(async (root: string, agent: string) => {
      reviews.byRoot[root] = { phase: 'failed', agent, message: 'codex 退出了' }
    })
    startShip(ctx, 'push-base', '推送 main')
    await settle()
    expect(pushBase).toHaveBeenCalledTimes(1)
  })
})

describe('pull first fails', () => {
  it('hands a diverged branch to the agent (the 拉取 hand-off), nothing pushed', async () => {
    prepush.mockResolvedValueOnce({ ok: false, reason: 'failed', from: 'origin/feat', failure: { kind: 'diverged', message: '远程分支和本地分叉', next: 'handoff', tail: '' } })
    startShip(ctx, 'push-pr', '推送')
    await settle()
    expect(push).not.toHaveBeenCalled()
    expect(startBackgroundReview).not.toHaveBeenCalled()
    expect(state()!.steps.map((s) => [s.id, s.label, s.state])).toEqual([
      ['sync', '拉取 origin/feat', 'failed'],
      ['review', '审阅', 'pending'],
      ['push', '推送 origin/feat', 'pending']
    ])
    expect(state()!.error?.prompt).toContain('git pull --no-rebase')
  })

  it('says a rebase of the base stopped in the main checkout, and hands it over there (path ①)', async () => {
    prepush.mockResolvedValueOnce({ ok: false, reason: 'conflicts', files: ['a.txt'], from: 'origin/main', checkout: '/repo', message: '把 main 的提交变基到 origin/main 时停在了冲突上：1 个文件' })
    startShip(onBase, 'push-base', '推送 main')
    await settle()
    expect(pushBase).not.toHaveBeenCalled()
    expect(failureWay(state(onBase.worktree)!.error!)).toEqual({ kind: 'handoff' })
    expect(state(onBase.worktree)!.error?.prompt).toContain('git rebase --continue')
  })
})

describe('path ① · a protected base', () => {
  it('hands the agent the move to a new branch and a PR instead of 改为创建 PR', async () => {
    workspace.sessions = [{ id: 's1', kind: 'claude', status: 'idle', worktreeId: 'w0' }]
    prepush.mockResolvedValueOnce({ ok: true, pulled: null, range, commits: 2 })
    pushBase.mockResolvedValueOnce({
      ok: true,
      commit: 'c'.repeat(40),
      pushed: false,
      pushRefused: true,
      pushError: 'main 受保护，origin 不收直接推送',
      failure: { kind: 'protected-branch', message: 'main 受保护', next: 'create-pr', tail: 'GH006' }
    })
    startShip({ ...onBase, settings: { ...onBase.settings, review: { ...onBase.settings.review, beforePush: false } } }, 'push-base', '推送 main')
    await settle()
    const error = state(onBase.worktree)!.error!
    expect(error.pushRefused).toBeUndefined()
    expect(failureWay(error)).toEqual({ kind: 'handoff' })
    expect(error.prompt).toContain('git branch -f main refs/remotes/origin/main')
    expect(error.prompt).toContain('还没推送的 2 个提交')
    await handConflictsToAgent(onBase.worktree)
    expect(inserted.at(-1)?.text).toBe(error.prompt)
    expect(state(onBase.worktree)).toBeUndefined()
  })
})

describe('自动修复 never reviews its pushes', () => {
  it('is never a pre-push review, whatever the settings and the push', () => {
    const review = { mode: 'builtin' as const, beforePush: true }
    for (const kind of ['push-base', 'push-pr', 'pr'] as const) {
      expect(prePushReview({ origin: 'chain', kind, review, reviewer: true })).toBe(true)
      expect(prePushReview({ origin: 'auto-fix', kind, review, reviewer: true })).toBe(false)
    }
    // Nothing pushed, nothing reviewed; the switch and the reviewer still decide for the chain.
    expect(prePushReview({ origin: 'chain', kind: 'main', review, reviewer: true })).toBe(false)
    expect(prePushReview({ origin: 'chain', kind: 'push-base', review: { ...review, beforePush: false }, reviewer: true })).toBe(false)
    expect(prePushReview({ origin: 'chain', kind: 'push-base', review: { ...review, mode: 'agent-command' as never }, reviewer: true })).toBe(false)
    expect(prePushReview({ origin: 'chain', kind: 'push-base', review, reviewer: false })).toBe(false)
  })
})
