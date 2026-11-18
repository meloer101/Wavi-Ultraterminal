import { describe, expect, it } from 'vitest'
import type { GitWorktreeInfo, GitWorktreeListing } from '@shared/git-worktrees'
import type { Session, Worktree } from '@shared/types'
import {
  branchesOf,
  buildRows,
  cleanupPlan,
  deleteBlocker,
  fitLines,
  formatAhead,
  formatDiff,
  keptText,
  listWithin,
  mergeListing,
  COLLAPSED,
  pickRows,
  rowLabels,
  selectedRow,
  tildePath
} from './model'

function info(patch: Partial<GitWorktreeInfo> & { path: string }): GitWorktreeInfo {
  return {
    realPath: patch.path,
    head: 'aaaaaaaaaaaa',
    branch: null,
    isMain: false,
    locked: false,
    prunable: null,
    rebasing: null,
    unreachableCommits: 0,
    base: 'main',
    ahead: 0,
    behind: 0,
    merged: false,
    added: 0,
    removed: 0,
    dirtyFiles: [],
    dirtyCount: 0,
    detailed: true,
    ...patch
  }
}

function session(id: string, worktreeId: string, patch: Partial<Session> = {}): Session {
  return { id, worktreeId, kind: 'claude', title: id, status: 'idle', startedAt: 0, lastActivityAt: 0, ...patch }
}

const listing: GitWorktreeListing = {
  mainBranch: 'main',
  worktrees: [
    info({ path: '/private/repo', branch: 'main', isMain: true, base: null, ahead: null, behind: null }),
    info({ path: '/wt/feature', branch: 'jacob/feature', ahead: 2, behind: 1, added: 5, removed: 1, dirtyCount: 1, dirtyFiles: ['a.ts'] }),
    info({ path: '/wt/merged-busy', branch: 'jacob/merged-busy', merged: true, behind: 3 }),
    info({ path: '/wt/merged', branch: 'jacob/merged', merged: true, behind: 3 }),
    info({ path: '/wt/fresh', branch: 'jacob/fresh', ahead: 0, behind: 4 }),
    info({ path: '/wt/gone', branch: 'jacob/gone', prunable: 'gitdir file points to non-existent location', ahead: 1 })
  ],
  realPaths: { '/repo': '/private/repo' }
}

const worktrees: Worktree[] = [
  { id: 'w-main', projectId: 'p', branch: 'main', path: '/repo', isMain: true },
  { id: 'w-feature', projectId: 'p', branch: 'jacob/feature', path: '/wt/feature', isMain: false },
  { id: 'w-merged-busy', projectId: 'p', branch: 'jacob/merged-busy', path: '/wt/merged-busy', isMain: false }
]

const sessions: Session[] = [
  session('shell', 'w-main', { kind: 'shell', title: 'main', lastActivityAt: 5 }),
  session('idle', 'w-feature', { title: '空闲的', lastActivityAt: 9 }),
  session('waiting', 'w-feature', { title: 'Cookie 会话迁移', status: 'needs_you', lastActivityAt: 1 }),
  session('done', 'w-merged-busy', { title: '已合并的', status: 'done_unread', kind: 'codex' })
]

describe('buildRows', () => {
  const groups = buildRows(listing, worktrees, sessions)

  it('keeps the main checkout and every worktree with a session in the working list, merged or not', () => {
    expect(groups.working.map((r) => r.name)).toEqual(['main', 'jacob/feature', 'jacob/merged-busy'])
    const main = groups.working[0]!
    expect(main.sessions.map((s) => s.id)).toEqual(['shell'])
    expect(main.openPath).toBe('/repo')
    expect(main).toMatchObject({ title: 'main', where: 'main · 主目录', agent: 'shell', ahead: '' })
    expect(groups.working[2]).toMatchObject({ title: '已合并的', where: 'jacob/merged-busy', agent: 'codex', ahead: '已合并' })
  })

  it('names the row after the most urgent session, its branch after it; ahead without behind', () => {
    const feature = groups.working[1]!
    expect(feature.status).toBe('needs_you')
    expect(feature.sessions.map((s) => s.id)).toEqual(['waiting', 'idle'])
    expect(feature).toMatchObject({ title: 'Cookie 会话迁移', where: 'jacob/feature', agent: 'claude', diff: '+5 −1', ahead: '↑2' })
  })

  it('puts session-less merged or missing worktrees in 可清理, other session-less ones in 没有会话', () => {
    expect(groups.cleanable.map((r) => r.name)).toEqual(['jacob/merged', 'jacob/gone'])
    // The group says merged; the row does not repeat it.
    expect(groups.cleanable[0]).toMatchObject({ title: 'jacob/merged', where: '', agent: null, ahead: '' })
    expect(groups.cleanable[1]).toMatchObject({ title: 'jacob/gone', where: '文件夹已不在', ahead: '↑1' })
    expect(groups.idle.map((r) => r.name)).toEqual(['jacob/fresh'])
    expect(groups.idle[0]).toMatchObject({ title: 'jacob/fresh', where: '', ahead: '' })
    expect(groups.idle[0]!.status).toBeNull()
  })

  // PRD v1.217 ②: 可清理 holds only what 全部清理 would really remove, so its count is that number.
  it('leaves a merged worktree out of 可清理 when deleting it would be refused, and says 已合并 on the row', () => {
    const merged = (name: string, patch: Partial<GitWorktreeInfo> = {}) => info({ path: `/wt/${name}`, branch: 'jacob/x', merged: true, ...patch })
    const odd = buildRows(
      {
        ...listing,
        worktrees: [
          merged('clean'),
          merged('dirty', { dirtyCount: 1, dirtyFiles: ['a.ts'] }),
          merged('locked', { locked: true }),
          merged('undetailed', { detailed: false, dirtyCount: null })
        ]
      },
      [],
      []
    )
    expect(odd.cleanable.map((r) => r.name)).toEqual(['jacob/x'])
    expect(odd.cleanable[0]!.key).toBe('/wt/clean')
    expect(odd.cleanable[0]!.ahead).toBe('')
    expect(odd.idle.map((r) => r.key)).toEqual(['/wt/dirty', '/wt/locked', '/wt/undetailed'])
    // Not in 可清理 any more, the row says merged itself.
    expect(odd.idle.map((r) => r.ahead)).toEqual(['已合并', '已合并', '已合并'])
    expect(odd.idle[0]!.diff).toBe('+0 −0')
  })

  it('still cleans up a worktree whose folder is gone, and never one with a session', () => {
    const gone = buildRows({ ...listing, worktrees: [info({ path: '/wt/gone', branch: 'jacob/gone', prunable: 'gone' })] }, [], [])
    expect(gone.cleanable.map((r) => r.name)).toEqual(['jacob/gone'])
    const busy = buildRows(
      { ...listing, worktrees: [info({ path: '/wt/busy', branch: 'jacob/busy', merged: true })] },
      [{ id: 'w-busy', projectId: 'p', branch: 'jacob/busy', path: '/wt/busy', isMain: false }],
      [session('s', 'w-busy')]
    )
    expect(busy.working.map((r) => r.name)).toEqual(['jacob/busy'])
    expect(busy.cleanable).toEqual([])
  })

  it('never offers the main checkout for cleanup, even without sessions', () => {
    expect(buildRows(listing, [], []).working.map((r) => r.name)).toEqual(['main'])
  })

  it('names a detached worktree by its short commit, a rebasing one by its branch', () => {
    const odd = buildRows({ ...listing, worktrees: [info({ path: '/a', head: '0123456789ab' }), info({ path: '/b', rebasing: 'jacob/x' })] }, [], [])
    expect(odd.idle.map((r) => [r.title, r.where])).toEqual([
      ['0123456', '分离的 HEAD'],
      ['jacob/x', '变基中']
    ])
  })
})

describe('branchesOf', () => {
  it('names each record git lists by its branch, matching by resolved path, and skips records git does not list', () => {
    const records: Worktree[] = [
      { id: 'w-main', projectId: 'p', branch: '', path: '/repo', isMain: true },
      { id: 'w-feature', projectId: 'p', branch: 'old', path: '/wt/feature', isMain: false },
      { id: 'w-elsewhere', projectId: 'p', branch: 'x', path: '/wt/elsewhere', isMain: false }
    ]
    expect(branchesOf(listing, records)).toEqual(new Map([['w-main', 'main'], ['w-feature', 'jacob/feature']]))
  })

  it('names a checkout by the branch it is rebasing, and leaves a detached one out (no short commit as a branch)', () => {
    const detached: GitWorktreeListing = {
      mainBranch: 'main',
      worktrees: [info({ path: '/a', head: 'abcdef123456' }), info({ path: '/b', rebasing: 'jacob/fix' })],
      realPaths: {}
    }
    const records: Worktree[] = [
      { id: 'a', projectId: 'p', branch: '', path: '/a', isMain: true },
      { id: 'b', projectId: 'p', branch: '', path: '/b', isMain: false }
    ]
    expect(branchesOf(detached, records)).toEqual(new Map([['b', 'jacob/fix']]))
  })
})

describe('deleteBlocker', () => {
  const base = { info: info({ path: '/wt/x', branch: 'x' }), sessions: [] as Session[] }
  const blocker = (patch: Partial<GitWorktreeInfo>) => deleteBlocker({ ...base, info: info({ path: '/x', branch: 'x', ...patch }) })

  it('allows a clean worktree with no live session', () => {
    expect(deleteBlocker(base)).toBeNull()
    expect(deleteBlocker({ ...base, sessions: [session('s', 'w', { status: 'done_unread' })] })).toBeNull()
  })

  it('refuses the main checkout, a live session, uncommitted changes, a lock and a rebase', () => {
    expect(blocker({ isMain: true })).toBe('主目录不能删除')
    expect(deleteBlocker({ ...base, sessions: [session('s', 'w', { status: 'running' })] })).toMatch(/正在运行/)
    expect(deleteBlocker({ ...base, sessions: [session('s', 'w', { status: 'needs_you' })] })).toMatch(/等你处理/)
    expect(blocker({ dirtyCount: 2 })).toBe('有 2 个未提交的改动，先提交或丢弃')
    expect(blocker({ locked: true })).toMatch(/锁定/)
    expect(blocker({ branch: null, rebasing: 'x' })).toMatch(/变基/)
  })

  it('treats whatever git could not check as a reason, never as clean', () => {
    expect(blocker({ dirtyCount: null })).toBe('无法确认有没有未提交的改动')
    expect(blocker({ detailed: false })).toMatch(/还没读完/)
    expect(blocker({ branch: null, unreachableCommits: null })).toMatch(/无法确认它的提交/)
  })

  it('refuses a detached worktree with commits no branch has', () => {
    expect(blocker({ branch: null, unreachableCommits: 2 })).toBe('有 2 个提交不在任何分支上，先给它建一个分支')
    expect(blocker({ branch: null, unreachableCommits: 0 })).toBeNull()
  })
})

describe('cleanupPlan', () => {
  it('removes the safe ones and lists why the others stay', () => {
    const groups = buildRows(
      { ...listing, worktrees: [...listing.worktrees, info({ path: '/wt/dirty', branch: 'dirty', merged: true, dirtyCount: 1 })] },
      worktrees,
      sessions
    )
    // A merged row with uncommitted work is in 没有会话 since v1.217: the plan still says why it stays.
    const dirty = groups.idle.find((r) => r.name === 'dirty')!
    const plan = cleanupPlan([...groups.cleanable, dirty])
    expect(plan.remove.map((r) => r.name)).toEqual(['jacob/merged', 'jacob/gone'])
    expect(plan.skip.map((s) => [s.row.name, s.reason])).toEqual([['dirty', '有 1 个未提交的改动，先提交或丢弃']])
  })

  it('never touches a row with a session, even an idle one', () => {
    const [row] = buildRows(listing, worktrees, sessions).working.filter((r) => r.name === 'jacob/merged-busy')
    const plan = cleanupPlan([row!])
    expect(plan.remove).toEqual([])
    expect(plan.skip[0]!.reason).toBe('有会话')
  })
})

describe('fitLines', () => {
  it('keeps every line that fits, counting the separators', () => {
    expect(fitLines(['ab', 'cd', 'ef'], 8)).toEqual({ shown: ['ab', 'cd', 'ef'], left: 0 })
    expect(fitLines(['ab', 'cd', 'ef'], 7)).toEqual({ shown: ['ab', 'cd'], left: 1 })
    expect(fitLines(['ab', 'cd', 'ef'], 9, 2)).toEqual({ shown: ['ab', 'cd'], left: 1 })
  })

  it('stops at the first line that does not fit, and shows none when even the first is too long', () => {
    expect(fitLines(['ab', 'a long one', 'c'], 5)).toEqual({ shown: ['ab'], left: 2 })
    expect(fitLines(['a long one', 'c'], 5)).toEqual({ shown: [], left: 2 })
    expect(fitLines([], 5)).toEqual({ shown: [], left: 0 })
  })
})

describe('mergeListing', () => {
  it('keeps the previous details of worktrees a partial listing skipped, while their HEAD is the same', () => {
    const skipped = info({ path: '/wt/merged', branch: 'jacob/merged', detailed: false, merged: false, dirtyCount: null })
    const moved = info({ path: '/wt/fresh', branch: 'jacob/fresh', head: 'bbbb', detailed: false, dirtyCount: null })
    const merged = mergeListing(listing, { ...listing, worktrees: [listing.worktrees[0]!, skipped, moved] })
    expect(merged.worktrees[1]).toMatchObject({ merged: true, dirtyCount: 0, detailed: true })
    expect(merged.worktrees[2]).toMatchObject({ detailed: false, dirtyCount: null })
  })
})

describe('formatting', () => {
  it('shows uncommitted stats only when something is uncommitted, ? when unknown', () => {
    expect(formatDiff({ added: 0, removed: 0, dirtyCount: 0 })).toBe('')
    expect(formatDiff({ added: 0, removed: 0, dirtyCount: 1 })).toBe('+0 −0')
    expect(formatDiff({ added: 42, removed: 18, dirtyCount: 3 })).toBe('+42 −18')
    expect(formatDiff({ added: 12345, removed: 6789, dirtyCount: 40 })).toBe('+12345 −6789')
    expect(formatDiff({ added: 0, removed: 0, dirtyCount: null })).toBe('?')
  })

  it('shows commits of its own, 已合并 once merged, nothing at 0 or without a base', () => {
    expect(formatAhead({ ahead: 3, merged: false, base: 'main' })).toBe('↑3')
    expect(formatAhead({ ahead: 0, merged: false, base: 'main' })).toBe('')
    expect(formatAhead({ ahead: 0, merged: true, base: 'main' })).toBe('已合并')
    expect(formatAhead({ ahead: null, merged: false, base: null })).toBe('')
  })

  it('abbreviates the home folder', () => {
    expect(tildePath('/Users/me/.tr/worktrees/a', '/Users/me')).toBe('~/.tr/worktrees/a')
    expect(tildePath('/Users/me', '/Users/me/')).toBe('~')
    expect(tildePath('/Users/meow/a', '/Users/me')).toBe('/Users/meow/a')
  })

  it('labels: a session titles the row and the branch follows; without one the branch leads and only oddities follow', () => {
    const one = [session('s', 'w', { title: '结算页性能优化', kind: 'codex' })]
    expect(rowLabels('jacob/x', one, info({ path: '/x', branch: 'jacob/x' }))).toEqual({ title: '结算页性能优化', where: 'jacob/x' })
    expect(rowLabels('main', [], info({ path: '/r', branch: 'main', isMain: true }))).toEqual({ title: 'main', where: '主目录' })
    expect(rowLabels('abcdef1', [], info({ path: '/d', head: 'abcdef123', unreachableCommits: 1, locked: true }))).toEqual({
      title: 'abcdef1',
      where: '分离的 HEAD · 1 个提交不在分支上 · 已锁定'
    })
  })

  it('says what deleting keeps', () => {
    expect(keptText({ branch: 'jacob/x' })).toBe('分支 jacob/x 保留')
    expect(keptText({ branch: null })).toBe('它的提交都已在其他分支上')
  })
})

describe('selectedRow', () => {
  const { working } = buildRows(listing, worktrees, sessions)

  it("keeps the user's pick, else follows the active session's worktree", () => {
    expect(selectedRow(working, '/wt/feature', 'w-main')?.name).toBe('jacob/feature')
    expect(selectedRow(working, '/gone', 'w-main')?.name).toBe('main')
    expect(selectedRow(working, null, null)).toBeNull()
  })

  it('shows nothing expanded once the user collapsed the row', () => {
    expect(selectedRow(working, COLLAPSED, 'w-main')).toBeNull()
  })
})

describe('pickRows', () => {
  // As drawn: the working rows (the main checkout left out), then 可清理, then 没有会话.
  const ordered = ['/wt/a', '/wt/b', '/wt/c', '/wt/d']
  // `never` empty: the main checkout is not drawn at all in these.
  const pick = (input: {
    ordered?: readonly string[]
    picked?: readonly string[]
    anchor?: string | null
    id: string
    how: 'range' | 'toggle'
    never?: readonly string[]
  }) => pickRows({ ordered, picked: [], anchor: null, ...input, never: input.never ?? [] })

  it('⌘ click adds one row and takes it out again', () => {
    expect(pick({ id: '/wt/b', how: 'toggle' })).toEqual(['/wt/b'])
    expect(pick({ picked: ['/wt/b'], anchor: '/wt/b', id: '/wt/b', how: 'toggle' })).toEqual([])
    expect(pick({ picked: ['/wt/a'], anchor: '/wt/a', id: '/wt/c', how: 'toggle' })).toEqual(['/wt/a', '/wt/c'])
  })

  it('⇧ click picks the rows between the anchor and the clicked one, across groups, in drawn order', () => {
    expect(pick({ picked: ['/wt/a'], anchor: '/wt/a', id: '/wt/c', how: 'range' })).toEqual(['/wt/a', '/wt/b', '/wt/c'])
    expect(pick({ picked: ['/wt/d'], anchor: '/wt/d', id: '/wt/b', how: 'range' })).toEqual(['/wt/b', '/wt/c', '/wt/d'])
  })

  it('⇧ click without an anchor (or with one no longer drawn) picks only the clicked row', () => {
    expect(pick({ id: '/wt/c', how: 'range' })).toEqual(['/wt/c'])
    expect(pick({ anchor: '/wt/gone', id: '/wt/c', how: 'range' })).toEqual(['/wt/c'])
  })

  it('⇧ click keeps what was already picked', () => {
    expect(pick({ picked: ['/wt/d'], anchor: '/wt/a', id: '/wt/b', how: 'range' })).toEqual(['/wt/a', '/wt/b', '/wt/d'])
  })

  it('drops keys that are no longer drawn', () => {
    expect(pick({ ordered: ['/wt/b', '/wt/c'], picked: ['/wt/a', '/wt/b'], anchor: '/wt/a', id: '/wt/c', how: 'range' })).toEqual(['/wt/b', '/wt/c'])
    expect(pick({ ordered: ['/wt/b'], picked: ['/wt/a', '/wt/c'], anchor: '/wt/c', id: '/wt/b', how: 'toggle' })).toEqual(['/wt/b'])
  })

  it('ranges from a `never` row (the main checkout) without ever picking it', () => {
    const withMain = ['/repo', '/wt/a', '/wt/b', '/wt/c']
    expect(pickRows({ ordered: withMain, picked: [], anchor: '/repo', id: '/wt/b', how: 'range', never: ['/repo'] })).toEqual(['/wt/a', '/wt/b'])
    // Even a range that starts and ends on it leaves it out.
    expect(pickRows({ ordered: withMain, picked: [], anchor: '/repo', id: '/repo', how: 'range', never: ['/repo'] })).toEqual([])
    expect(pickRows({ ordered: withMain, picked: ['/wt/c'], anchor: null, id: '/repo', how: 'toggle', never: ['/repo'] })).toEqual(['/wt/c'])
  })
})

describe('listWithin', () => {
  const more = (left: number) => `…还有 ${left} 个`

  it('leaves a list that fits unchanged, even exactly at the budget', () => {
    expect(listWithin(['ab', 'cd'], ';', 5, more)).toBe('ab;cd')
    expect(listWithin(['ab'], ';', 5, more)).toBe('ab')
    // A long line that fits keeps all of it: no room is reserved for a suffix it does not need.
    expect(listWithin(['x'.repeat(115)], ';', 120, more)).toBe('x'.repeat(115))
  })

  it('cuts what does not fit and says how many are left, never over the budget', () => {
    const items = ['a'.repeat(20), 'b'.repeat(20), 'c'.repeat(20)]
    expect(listWithin(items, ';', 50, more)).toBe(`${'a'.repeat(20)};${'b'.repeat(20)};…还有 1 个`)
    expect(listWithin(items, ';', 50, more).length).toBeLessThanOrEqual(50)
  })

  it('counts a two-character separator', () => {
    const plus = (left: number) => `+${left}`
    expect(listWithin(['aa', 'bb', 'cc'], '、、', 10, plus)).toBe('aa、、bb、、cc')
    expect(listWithin(['aa', 'bb', 'cc'], '、、', 9, plus)).toBe('aa、、+2')
  })

  it('shows only the suffix when not even one item fits', () => {
    expect(listWithin(['a'.repeat(40), 'b'], ';', 20, more)).toBe('…还有 2 个')
  })
})
