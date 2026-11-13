// 看板 · GitHub's main side: real git repositories in a temp folder, gh replaced by canned answers.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const base = realpathSync(mkdtempSync(join(tmpdir(), 'tr-github-board-')))
const roots = new Set<string>()
const ghCalls: string[][] = []
let answers: (args: string[]) => { code: number; stdout: string; stderr: string } = () => ({ code: 1, stdout: '', stderr: 'unset' })

vi.mock('electron', () => ({ ipcMain: { handle: () => {} } }))
vi.mock('./workspace-store', () => ({ isProjectRoot: (path: string) => roots.has(path) }))
vi.mock('./pull-requests', () => ({
  detectGh: () => Promise.resolve('ready'),
  gh: (args: string[]) => {
    ghCalls.push(args)
    return Promise.resolve(answers(args))
  },
  ghPausedUntil: () => 0,
  pauseGhForRateLimit: () => {},
  gitHubRepoFromUrl: (url: string) => {
    // A GitHub URL, or a local folder whose name says it stands for acme/web (so fetches work offline).
    return Promise.resolve(/github\.com[:/]acme\/web|acme-web/.test(url) ? { host: 'github.com', owner: 'acme', name: 'web' } : null)
  }
}))

const { listBoard, prStart } = await import('./github-board')

const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd, env }).toString()

function repo(name: string): string {
  const dir = join(base, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'README.md'), '# r\n')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'init')
  return dir
}

/** A clone whose origin is a local repo, plus a second remote that says it is acme/web on GitHub. */
function project(name: string): { origin: string; clone: string } {
  const origin = repo(`${name}-origin`)
  const clone = join(base, `${name}-clone`)
  git(base, 'clone', '-q', origin, clone)
  // gh's set-default remote names the GitHub repository; fetches go to origin (a local folder here).
  git(clone, 'remote', 'add', 'upstream', 'git@github.com:acme/web.git')
  git(clone, 'config', 'remote.upstream.gh-resolved', 'base')
  roots.add(clone)
  return { origin, clone }
}

afterAll(() => rmSync(base, { recursive: true, force: true }))
beforeEach(() => {
  ghCalls.length = 0
})

describe('listBoard', () => {
  it('lists issues and PRs of the gh-resolved repository and keeps the answer until 刷新', async () => {
    const { clone } = project('list')
    answers = (args) => {
      if (args[0] === 'api') return { code: 0, stdout: 'Jacob\n', stderr: '' }
      if (args[0] === 'issue') return { code: 0, stdout: JSON.stringify([{ number: 1, title: 'bug', url: 'https://github.com/acme/web/issues/1', author: { login: 'a' } }]), stderr: '' }
      return { code: 0, stdout: JSON.stringify([{ number: 2, title: 'fix', reviewRequests: [{ login: 'jacob' }] }]), stderr: '' }
    }
    const first = await listBoard({ root: clone, scope: 'all' })
    expect(first).toMatchObject({ gh: 'ready', project: { state: 'ok', repo: { owner: 'acme', name: 'web' } } })
    if ('project' in first && first.project.state === 'ok') expect(first.project.prs[0]?.reviewRequestedFromMe).toBe(true)
    expect(ghCalls.find((a) => a[0] === 'issue')).toContain('--repo=github.com/acme/web')
    const calls = ghCalls.length
    await listBoard({ root: clone, scope: 'all' })
    expect(ghCalls.length).toBe(calls)
    await listBoard({ root: clone, scope: 'all', force: true })
    expect(ghCalls.length).toBeGreaterThan(calls)
  })

  it('says a project is not on GitHub, and refuses a folder that is not a project', async () => {
    const plain = repo('plain')
    roots.add(plain)
    expect(await listBoard({ root: plain, scope: 'all' })).toEqual({ gh: 'ready', project: { state: 'not-github' } })
    expect(await listBoard({ root: join(base, 'nope'), scope: 'all' })).toEqual({ gh: 'ready', project: { state: 'error', message: '请求无效' } })
  })

  it('passes on gh’s own words when a list fails', async () => {
    const { clone } = project('fails')
    answers = (args) => (args[0] === 'api' ? { code: 0, stdout: 'x', stderr: '' } : { code: 1, stdout: '', stderr: 'HTTP 502: Bad Gateway' })
    expect(await listBoard({ root: clone, scope: 'mine', force: true })).toEqual({ gh: 'ready', project: { state: 'error', message: 'HTTP 502: Bad Gateway' } })
  })
})

describe('prStart', () => {
  it('fetches a same-repository PR head to its remote-tracking branch, which the new branch will track', async () => {
    const origin = repo('same-acme-web')
    git(origin, 'switch', '-q', '-c', 'feat/fix')
    git(origin, 'commit', '-q', '--allow-empty', '-m', 'fix')
    git(origin, 'switch', '-q', 'main')
    const clone = join(base, 'same-clone')
    git(base, 'clone', '-q', origin, clone)
    roots.add(clone)
    answers = () => ({ code: 0, stdout: JSON.stringify({ headRefName: 'feat/fix', baseRefName: 'main', isCrossRepository: false }), stderr: '' })
    expect(await prStart({ root: clone, kind: 'pr', number: 5 })).toEqual({ ok: true, startAt: 'refs/remotes/origin/feat/fix', baseRef: 'main', headRef: 'feat/fix' })
    expect(git(clone, 'rev-parse', 'refs/remotes/origin/feat/fix').trim()).toBe(git(origin, 'rev-parse', 'feat/fix').trim())
  })

  it('fetches a fork’s PR head under refs/wavi/pull/, where fetch --prune leaves it', async () => {
    const origin = repo('fork-acme-web')
    git(origin, 'commit', '-q', '--allow-empty', '-m', 'from a fork')
    git(origin, 'update-ref', 'refs/pull/7/head', 'HEAD')
    const head = git(origin, 'rev-parse', 'HEAD').trim()
    git(origin, 'reset', '-q', '--hard', 'HEAD~1')
    const clone = join(base, 'fork-clone')
    git(base, 'clone', '-q', origin, clone)
    roots.add(clone)
    answers = () => ({ code: 0, stdout: JSON.stringify({ headRefName: 'patch-1', baseRefName: 'main', isCrossRepository: true }), stderr: '' })
    expect(await prStart({ root: clone, kind: 'pr', number: 7 })).toEqual({ ok: true, startAt: 'refs/wavi/pull/7', baseRef: 'main', headRef: null })
    git(clone, 'fetch', '-q', '--all', '--prune')
    expect(git(clone, 'rev-parse', 'refs/wavi/pull/7').trim()).toBe(head)
  })

  it('refuses an issue, and a PR whose head branch could be read as an option', async () => {
    const origin = repo('bad-acme-web')
    const clone = join(base, 'bad-clone')
    git(base, 'clone', '-q', origin, clone)
    roots.add(clone)
    expect(await prStart({ root: clone, kind: 'issue', number: 7 })).toEqual({ ok: false, message: '请求无效' })
    answers = () => ({ code: 0, stdout: JSON.stringify({ headRefName: '--upload-pack=x', baseRefName: 'main' }), stderr: '' })
    expect(await prStart({ root: clone, kind: 'pr', number: 8 })).toEqual({ ok: false, message: 'PR 的分支名读不懂' })
  })
})
