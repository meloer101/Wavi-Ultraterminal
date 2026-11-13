import { describe, expect, it } from 'vitest'
import type { BoardItem, BoardList, BoardPr } from '@shared/github-board'
import type { Project, Session, Worktree } from '@shared/types'
import { checksMark, ghProblem, githubSummary, linkedSessions, linkKey, matchesFilter, orderProjects, prTags } from './github-model'

const item: BoardItem = { kind: 'issue', number: 139, title: '结算页在 Safari 17 上白屏', url: '', author: 'lin-wei', labels: ['bug'], comments: 0, updatedAt: 0 }
const pr = (patch: Partial<BoardPr>): BoardPr => ({
  ...item, kind: 'pr', draft: false, review: null, reviewRequestedFromMe: false, checks: { state: 'none', total: 0, passed: 0, pending: 0, failing: [] }, ...patch
})
const ok = (issues: number, prs: number): BoardList => ({
  gh: 'ready',
  project: { state: 'ok', repo: { host: 'github.com', owner: 'a', name: 'b' }, issues: Array.from({ length: issues }, () => item), prs: Array.from({ length: prs }, () => pr({})), fetchedAt: 0 }
})

describe('github model', () => {
  it('filters by number, title, label and author, every word', () => {
    expect(matchesFilter(item, '#13')).toBe(true)
    expect(matchesFilter(item, '140')).toBe(false)
    expect(matchesFilter(item, 'safari BUG')).toBe(true)
    expect(matchesFilter(item, 'safari docs')).toBe(false)
    expect(matchesFilter(item, '')).toBe(true)
  })

  it('puts the projects that are not on GitHub last', () => {
    const projects = [{ id: 'p1', rootPath: '/a' }, { id: 'p2', rootPath: '/b' }, { id: 'p3', rootPath: '/c' }] as Project[]
    const order = orderProjects(projects, { '/a': { loading: false, list: { gh: 'ready', project: { state: 'not-github' } } }, '/b': { loading: true, list: null } })
    expect(order.map((o) => [o.project.id, o.offGitHub])).toEqual([['p2', false], ['p3', false], ['p1', true]])
  })

  it('sums what the header says and notices when gh is not usable', () => {
    expect(githubSummary({ '/a': { loading: false, list: ok(4, 3) }, '/b': { loading: false, list: ok(2, 1) } })).toBe('2 个项目 · 6 个 issue · 4 个 PR')
    expect(githubSummary({ '/a': { loading: true, list: null }, '/n': { loading: false, list: { gh: 'ready', project: { state: 'not-github' } } } })).toBe('1 个项目')
    expect(ghProblem({ '/a': { loading: false, list: { gh: 'signed-out' } } })).toBe('signed-out')
    expect(ghProblem({ '/a': { loading: false, list: ok(0, 0) } })).toBeNull()
  })

  it('tags a PR by draft and review, and marks its checks', () => {
    expect(prTags(pr({ draft: true, reviewRequestedFromMe: true }))).toEqual([{ text: '草稿', tone: 'quiet' }, { text: '待你审阅', tone: 'attention' }])
    expect(prTags(pr({ review: 'approved' }))).toEqual([{ text: '已批准', tone: 'done' }])
    expect(checksMark(pr({ checks: { state: 'failing', total: 2, passed: 1, pending: 0, failing: [{ name: 'e2e', runId: null, jobId: null }] } }))).toEqual({ state: 'failing', text: '1 失败' })
    expect(checksMark(pr({}))).toBeNull()
  })

  it('finds the latest session started on an item, skipping archived worktrees', () => {
    const link = { repo: 'github.com/a/b', kind: 'issue' as const, number: 139 }
    const sessions = [
      { id: 's1', worktreeId: 'w1', startedAt: 1, github: link },
      { id: 's2', worktreeId: 'w2', startedAt: 2, github: link },
      { id: 's3', worktreeId: 'w1', startedAt: 3, github: { ...link, number: 1 } }
    ] as Session[]
    const worktrees = [{ id: 'w1' }, { id: 'w2', archived: { id: 'x' } }] as unknown as Worktree[]
    const byLink = linkedSessions(sessions, worktrees)
    expect(byLink.get(linkKey({ ...link, repo: 'GitHub.com/A/b' }))?.id).toBe('s1')
    expect(byLink.get(linkKey({ ...link, kind: 'pr' }))).toBeUndefined()
  })
})
