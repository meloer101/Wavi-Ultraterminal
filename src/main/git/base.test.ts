// Moving the base by itself, against real git repositories in a temp folder: the checkout lookup, the fast-forward's
// guards (diverged, an operation in progress, a dirty checkout it would touch, a base that moved), and the base lock.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: () => {} } }))
const { baseBusyMessage, checkoutIn, checkoutOf, fastForwardBase, fetchBase, withBase } = await import('./base')

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'tr-git-base-')))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'commit.gpgsign', GIT_CONFIG_VALUE_0: 'false' }
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }).toString()
const sha = (cwd: string, ref: string) => git(cwd, 'rev-parse', ref).trim()
const commit = (cwd: string, file: string, text: string, message: string) => {
  writeFileSync(join(cwd, file), text)
  git(cwd, 'add', '.')
  git(cwd, 'commit', '-q', '-m', message)
}

let n = 0
/** main pushed to a bare remote; another clone pushed `up.txt` (and `a.txt` with `touchA`), so origin/main is ahead. */
function behind(options: { touchA?: boolean } = {}): { root: string; bare: string } {
  const k = ++n
  const root = join(dir, `repo-${k}`)
  const bare = join(dir, `bare-${k}.git`)
  mkdirSync(root)
  git(dir, 'init', '-q', '--bare', '-b', 'main', bare)
  git(root, 'init', '-q', '-b', 'main')
  commit(root, 'a.txt', 'one\n', 'init')
  git(root, 'remote', 'add', 'origin', bare)
  git(root, 'push', '-q', '-u', 'origin', 'main')
  const other = join(dir, `other-${k}`)
  git(dir, 'clone', '-q', bare, other)
  commit(other, 'up.txt', 'u\n', 'upstream work')
  if (options.touchA) commit(other, 'a.txt', 'one\nupstream\n', 'upstream edits a')
  git(other, 'push', '-q', 'origin', 'main')
  return { root, bare }
}

describe('checkoutOf / checkoutIn', () => {
  it('finds the checkout that has the branch out, never a bare entry, and none for a branch nobody has out', async () => {
    const { root } = behind()
    git(root, 'branch', 'side')
    expect(await checkoutOf(root, 'main')).toBe(realpathSync(root))
    expect(await checkoutOf(root, 'side')).toBeNull()
    expect(checkoutIn([{ path: '/r.git', head: null, branch: 'main', bare: true, detached: false, locked: false, prunable: null }], 'main')).toBeUndefined()
  })
})

describe('fetchBase', () => {
  it('fetches only the base, forced into its remote-tracking ref (a rewritten remote branch still comes in)', async () => {
    const { root, bare } = behind()
    expect((await fetchBase(root, 'origin', 'refs/heads/main', 'refs/remotes/origin/main')).code).toBe(0)
    expect(sha(root, 'refs/remotes/origin/main')).toBe(sha(bare, 'main'))
    const rewritten = git(bare, 'commit-tree', '-p', 'main~1', '-m', 'rewritten', 'main^{tree}').trim()
    git(bare, 'update-ref', 'refs/heads/main', rewritten)
    expect((await fetchBase(root, 'origin', 'refs/heads/main', 'refs/remotes/origin/main')).code).toBe(0)
    expect(sha(root, 'refs/remotes/origin/main')).toBe(rewritten)
  })
})

describe('fastForwardBase', () => {
  it('fast-forwards the checkout that has the base out, carrying uncommitted changes it does not touch', async () => {
    const { root, bare } = behind()
    git(root, 'fetch', '-q', 'origin')
    writeFileSync(join(root, 'a.txt'), 'one\nlocal edit\n')
    expect(await fastForwardBase(root, 'main', 'refs/remotes/origin/main', 'origin/main')).toEqual({ ok: true, moved: true })
    expect(sha(root, 'main')).toBe(sha(bare, 'main'))
    expect(readFileSync(join(root, 'up.txt'), 'utf8')).toBe('u\n')
    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('one\nlocal edit\n')
    expect(await fastForwardBase(root, 'main', 'refs/remotes/origin/main', 'origin/main')).toEqual({ ok: true, moved: false })
  })

  it('refuses a checkout whose uncommitted changes the fast-forward would touch, and names them', async () => {
    const { root } = behind({ touchA: true })
    git(root, 'fetch', '-q', 'origin')
    writeFileSync(join(root, 'a.txt'), 'one\nlocal edit\n')
    const before = sha(root, 'main')
    expect(await fastForwardBase(root, 'main', 'refs/remotes/origin/main', 'origin/main')).toEqual({
      ok: false,
      reason: 'dirty',
      message: 'main 的工作区有未提交的改动，没有快进到 origin/main',
      files: ['a.txt']
    })
    expect(sha(root, 'main')).toBe(before)
  })

  it('moves the ref by compare-and-swap when nobody has the base out', async () => {
    const { root, bare } = behind()
    git(root, 'fetch', '-q', 'origin')
    git(root, 'checkout', '-q', '--detach')
    const head = sha(root, 'HEAD')
    expect(await fastForwardBase(root, 'main', 'refs/remotes/origin/main', 'origin/main')).toEqual({ ok: true, moved: true })
    expect(sha(root, 'refs/heads/main')).toBe(sha(bare, 'main'))
    expect(sha(root, 'HEAD')).toBe(head)
  })

  it('refuses a base with commits of its own, and one with an operation in progress', async () => {
    const { root } = behind()
    git(root, 'fetch', '-q', 'origin')
    git(root, 'update-ref', 'refs/heads/main', git(root, 'commit-tree', '-p', 'main', '-m', 'local only', 'main^{tree}').trim())
    git(root, 'reset', '-q', '--hard')
    expect(await fastForwardBase(root, 'main', 'refs/remotes/origin/main', 'origin/main')).toEqual({
      ok: false,
      reason: 'diverged',
      message: 'main 和 origin/main 各有对方没有的提交，没法快进'
    })

    const busy = behind()
    git(busy.root, 'fetch', '-q', 'origin')
    // A rebase stopped at an edit: HEAD detached, main (still behind origin/main) the branch being rewritten.
    execFileSync('git', ['-c', 'rebase.abbreviateCommands=false', 'rebase', '-i', '--root'], { cwd: busy.root, env: { ...env, GIT_SEQUENCE_EDITOR: "sed -i.bak 's/^pick /edit /'" }, stdio: 'ignore' })
    expect(await fastForwardBase(busy.root, 'main', 'refs/remotes/origin/main', 'origin/main')).toMatchObject({ ok: false, reason: 'busy', message: 'main 有进行中的 rebase，没有快进到 origin/main' })
    git(busy.root, 'rebase', '--abort')
  })

  it('does nothing for a base already at or past the target, or a target that is missing', async () => {
    const { root } = behind()
    expect(await fastForwardBase(root, 'main', 'refs/remotes/origin/nope', 'origin/nope')).toEqual({ ok: true, moved: false })
    commit(root, 'c.txt', 'c\n', 'ahead')
    expect(await fastForwardBase(root, 'main', 'main~1', 'main~1')).toEqual({ ok: true, moved: false })
  })
})

describe('withBase', () => {
  it('refuses a second operation on the same base while the first runs, not one on another base or repository', async () => {
    const refused = (message: string): string => `refused: ${message}`
    let release!: () => void
    const first = withBase(dir, 'main', refused, () => new Promise<string>((resolve) => (release = () => resolve('first'))))
    await new Promise((r) => setTimeout(r, 10))
    expect(await withBase(dir, 'main', refused, async () => 'second')).toBe(`refused: ${baseBusyMessage('main')}`)
    expect(baseBusyMessage('main')).toBe('正在合并、推送或提交 main：等它完成再试')
    expect(await withBase(dir, 'dev', refused, async () => 'other base')).toBe('other base')
    expect(await withBase(join(dir, 'repo-1'), 'main', refused, async () => 'other repository')).toBe('other repository')
    release()
    expect(await first).toBe('first')
    expect(await withBase(dir, 'main', refused, async () => 'after')).toBe('after')
  })
})
