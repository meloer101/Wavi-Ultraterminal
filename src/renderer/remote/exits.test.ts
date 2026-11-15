import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitChanges, GitFileChange } from '@shared/git-graph/log'
import type { PrStatus } from '@shared/pull-requests'
import type { ShipPreflight } from '@shared/ship'
import type { Project, Session, Worktree } from '@shared/types'
import { gitOf, useGit } from '../panels/git/store'
import { usePullRequests } from '../pull-requests/store'
import { useWorkspace } from '../state/workspace'

// The stores read `window` when they load.
const startShip = vi.hoisted(() => {
  vi.stubGlobal('window', { tr: {}, addEventListener: () => {}, removeEventListener: () => {} })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  return vi.fn()
})
vi.mock('../pull-requests/ship-runner', async (actual) => ({ ...(await actual<typeof import('../pull-requests/ship-runner')>()), startShip }))

const { remoteExits, remoteShipAction } = await import('./exits')

const project: Project = { id: 'p1', name: 'acme', rootPath: '/code/acme' }
const tree: Worktree = { id: 'w1', projectId: 'p1', branch: 'feat', path: '/wt/feat', isMain: false, baseBranch: 'main' }
const session: Session = { id: 's1', worktreeId: 'w1', kind: 'claude', title: 't', status: 'idle', startedAt: 0, lastActivityAt: 0 }

const file = (path: string, patch: Partial<GitFileChange> = {}): GitFileChange => ({ path, status: 'M', added: 1, removed: 0, ...patch }) as GitFileChange

const preflight = (patch: Partial<Extract<ShipPreflight, { ok: true }>> = {}): ShipPreflight => ({
  ok: true,
  branch: 'feat',
  base: 'main',
  remote: 'fork',
  baseProtected: false,
  suggested: 'main',
  uncommitted: 3,
  ahead: 1,
  merged: false,
  baseAheadOfUpstream: 0,
  baseBehindUpstream: 0,
  openPr: null,
  mergeMethods: null,
  head: 'h1h1h1h',
  gh: 'ready',
  remoteOnGitHub: true,
  operation: null,
  behindBase: 0,
  baseConflicts: [],
  pushed: true,
  upstream: { ahead: 1, behind: 0 },
  baseRemote: 'upstream',
  pullFrom: 'fork/feat',
  ...patch
})

let changes: GitChanges
let answer: ShipPreflight

beforeEach(() => {
  startShip.mockReset()
  changes = { branch: 'feat', base: 'main', baseRef: 'main', ahead: 1, behind: 0, uncommitted: [file('a.ts'), file('notes.md'), file('.env.local')], untrackedOmitted: 0, committed: [], head: 'h1h1h1h' }
  answer = preflight()
  useWorkspace.setState({ projects: [project], worktrees: [tree], sessions: [session], activeSessionId: 's1' })
  usePullRequests.setState({ gh: 'ready', byWorktree: {}, automation: {} })
  useGit.setState({ roots: {} })
  vi.stubGlobal('window', {
    tr: {
      pr: { refresh: () => {} },
      git: { changes: async () => changes },
      ship: { preflight: async () => answer },
      settings: { get: async () => ({ review: { mode: 'off' }, pr: {} }) },
      repoScripts: { get: async () => null }
    }
  })
})

const untick = (...paths: string[]): void => useGit.setState({ roots: { [tree.path]: { ...gitOf(tree.path), unticked: new Set(paths) } } })

describe('the phone’s exits', () => {
  // 提交 is its own action (not on the phone yet): the phone's exit ships the branch's commits and commits nothing,
  // ticked files included.
  it('commits nothing, and starts from the tip the preflight read', async () => {
    untick('notes.md', '.env.local')
    expect(await remoteShipAction('s1', { do: 'start', exit: 'main' })).toEqual({ ok: true })
    expect(startShip).toHaveBeenCalledTimes(1)
    const [ctx, kind, , options] = startShip.mock.calls[0]!
    expect(ctx).toMatchObject({ paths: null })
    expect(kind).toBe('main')
    // L11 / R31 / R60: the tip it starts from and where the base is pushed come from the preflight it just read.
    expect(options).toMatchObject({ head: 'h1h1h1h', baseRemote: 'upstream' })
  })

  it('refuses an exit that would commit nothing while every file is unticked', async () => {
    untick('a.ts', 'notes.md', '.env.local')
    answer = preflight({ ahead: 0, upstream: null, pushed: false })
    changes = { ...changes, ahead: 0 }
    const result = await remoteShipAction('s1', { do: 'start', exit: 'main' })
    expect(result).toMatchObject({ ok: false })
    expect(startShip).not.toHaveBeenCalled()
  })

  // 提交 is not on the phone yet: the chain's primary is shown blocked with where it runs; the exit beside it still runs.
  it('shows 提交 as a move for the Mac, and the exit beside it', async () => {
    const result = await remoteExits('s1')
    expect(result).toMatchObject({ ok: true, data: { primary: { kind: 'commit', label: '提交', blocker: '在 Mac 上提交' }, secondary: { kind: 'main', blocker: null } } })
  })

  it('shows the chain\'s state line with a recovery move only the Mac runs', async () => {
    changes = { ...changes, uncommitted: [] }
    answer = preflight({ uncommitted: 0, upstream: { ahead: 1, behind: 2 } })
    const result = await remoteExits('s1')
    expect(result).toMatchObject({ ok: true, data: { primary: { kind: 'handoff', blocker: '远程分支和本地分叉；在 Mac 上交给 Claude' } } })
  })

  // 推送 of the base after a local 合并: the phone starts it through the same `start` (its kind is opaque to iOS).
  it('offers and starts 推送 of the base after a local 合并', async () => {
    changes = { ...changes, ahead: 0, uncommitted: [] }
    answer = preflight({ ahead: 0, merged: true, uncommitted: 0, baseUnpushed: 2, upstream: { ahead: 0, behind: 0 } })
    const result = await remoteExits('s1')
    expect(result).toMatchObject({ ok: true, data: { primary: { kind: 'push-base', label: '推送', blocker: null }, secondary: null, archive: { blocker: null } } })
    expect(await remoteShipAction('s1', { do: 'start', exit: 'push-base' })).toEqual({ ok: true })
    const [ctx, kind, title, options] = startShip.mock.calls[0]!
    expect([kind, title]).toEqual(['push-base', '推送 main'])
    expect(ctx).toMatchObject({ paths: null, openPr: null })
    expect(options).toMatchObject({ head: 'h1h1h1h', baseRemote: 'upstream' })
  })

  it('refuses 推送 of the base when the base has nothing to push', async () => {
    expect(await remoteShipAction('s1', { do: 'start', exit: 'push-base' })).toMatchObject({ ok: false })
    expect(startShip).not.toHaveBeenCalled()
  })

  // Path ③: a PR closed on GitHub leaves 归档 (its own button), no exit.
  it('offers no exit, only 归档, once the PR was closed', async () => {
    changes = { ...changes, uncommitted: [] }
    answer = preflight({ uncommitted: 0 })
    const pr = { number: 5, state: 'closed', url: 'https://github.com/o/r/pull/5', title: 't', headOid: 'h1h1h1h' }
    usePullRequests.setState({ byWorktree: { [tree.path]: { worktree: tree.path, branch: 'feat', pr, checkedAt: 0 } as unknown as PrStatus } })
    const result = await remoteExits('s1')
    expect(result).toMatchObject({ ok: true, data: { primary: null, secondary: null, pr: { number: 5, state: 'closed' }, archive: { blocker: null } } })
  })

  // R24: with an open PR, an untracked nested repository is nothing to send: the phone opens the PR.
  it('opens a fully pushed PR when only a nested repository is uncommitted', async () => {
    changes = { ...changes, uncommitted: [file('vendor/x', { status: 'A', untracked: true, nested: true })] }
    answer = preflight({ openPr: 5, uncommitted: 1, upstream: { ahead: 0, behind: 0 } })
    const pr = { number: 5, state: 'open', url: 'https://github.com/o/r/pull/5', title: 't', headOid: 'h1h1h1h', details: { headOid: 'h1h1h1h', mergeState: 'clean' } }
    usePullRequests.setState({ byWorktree: { [tree.path]: { worktree: tree.path, branch: 'feat', pr, checkedAt: 0 } as unknown as PrStatus } })
    const result = await remoteExits('s1')
    expect(result).toMatchObject({ ok: true, data: { primary: { kind: 'open-pr', label: '打开 PR #5' } } })
  })
})
