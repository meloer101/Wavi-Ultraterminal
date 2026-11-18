// Real git repositories in a temp folder: what the Worktree view lists and what removal refuses.
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { SNAPSHOT_AUTHOR_EMAIL, SNAPSHOT_AUTHOR_NAME, SNAPSHOT_SUBJECT } from '@shared/git-worktrees'

const roots = new Set<string>()
vi.mock('./workspace-store', () => ({ isProjectRoot: (path: string) => roots.has(path) }))

const { listedWorktreePaths, listWorktrees, parentInsideWorktree, removeWorktree } = await import('./git-worktrees')

const base = realpathSync(mkdtempSync(join(tmpdir(), 'tr-git-worktrees-')))
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd, env }).toString()

/** A repo (main) with `n` commits, registered as a project. */
function repo(name: string): string {
  const dir = join(base, name)
  mkdirSync(dir)
  writeFileSync(join(dir, 'README.md'), '# r\n')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'init')
  roots.add(dir)
  return dir
}

const byPath = async (root: string, path: string) => (await listWorktrees(root, []))!.worktrees.find((w) => w.path === path)!

afterAll(() => rmSync(base, { recursive: true, force: true }))

describe('listWorktrees / removeWorktree on real repositories', () => {
  let root: string
  beforeAll(() => {
    root = repo('main-repo')
  })

  it('refuses a folder that is not one of the workspace projects', async () => {
    await expect(listWorktrees(join(base, 'elsewhere'), [])).rejects.toThrow()
    await expect(removeWorktree('/tmp', join(root, 'x'), false)).rejects.toThrow()
  })

  it('a fresh worktree whose base moved on is 无新提交, not merged; a committed and merged one is merged', async () => {
    const fresh = join(base, 'fresh')
    const done = join(base, 'done')
    git(root, 'worktree', 'add', '-q', '-b', 'fresh', fresh)
    git(root, 'worktree', 'add', '-q', '-b', 'done', done)
    writeFileSync(join(done, 'done.ts'), 'x\n')
    git(done, 'add', '.')
    git(done, 'commit', '-q', '-m', 'done')
    git(root, 'merge', '-q', '--no-ff', '-m', 'merge done', 'done')
    const freshInfo = await byPath(root, fresh)
    expect(freshInfo).toMatchObject({ branch: 'fresh', ahead: 0, behind: 2, merged: false, dirtyCount: 0 })
    expect(await byPath(root, done)).toMatchObject({ branch: 'done', ahead: 0, merged: true })
    // Listed for a workspace project: the Worktree view may open them though the workspace has no record of them.
    expect(listedWorktreePaths()).toEqual(expect.arrayContaining([fresh, done]))
  })

  it('reports git failures as unknown and refuses to remove (even with force)', async () => {
    const broken = join(base, 'broken')
    git(root, 'worktree', 'add', '-q', '-b', 'broken', broken)
    writeFileSync(join(broken, 'work.ts'), 'unsaved work\n')
    // `git status` inside now fails; the repository still lists the worktree.
    writeFileSync(join(broken, '.git'), 'gitdir: /nonexistent\n')
    const info = await byPath(root, broken)
    expect(info.dirtyCount).toBeNull()
    expect(await removeWorktree(root, broken, false)).toMatchObject({ ok: false, reason: 'unverified' })
    expect(await removeWorktree(root, broken, true)).toMatchObject({ ok: false, reason: 'unverified' })
    expect(existsSync(join(broken, 'work.ts'))).toBe(true)
  })

  it('refuses a detached worktree with commits no branch has', async () => {
    const detached = join(base, 'detached')
    git(root, 'worktree', 'add', '-q', '--detach', detached)
    git(detached, 'commit', '-q', '--allow-empty', '-m', 'only here')
    expect(await byPath(root, detached)).toMatchObject({ branch: null, unreachableCommits: 1, dirtyCount: 0 })
    expect(await removeWorktree(root, detached, false)).toMatchObject({ ok: false, reason: 'unreachable-commits', message: '1' })
    expect(existsSync(detached)).toBe(true)
    // Once a branch holds the commit, removal is safe.
    git(detached, 'branch', 'keep')
    expect(await removeWorktree(root, detached, false)).toEqual({ ok: true })
  })

  it('refuses uncommitted changes, the main checkout, and force without submodules', async () => {
    const dirty = join(base, 'dirty')
    git(root, 'worktree', 'add', '-q', '-b', 'dirty', dirty)
    writeFileSync(join(dirty, 'new.ts'), 'untracked\n')
    expect(await removeWorktree(root, dirty, false)).toEqual({ ok: false, reason: 'dirty' })
    expect(await removeWorktree(root, root, false)).toEqual({ ok: false, reason: 'main' })
    rmSync(join(dirty, 'new.ts'))
    expect(await removeWorktree(root, dirty, true)).toMatchObject({ ok: false, reason: 'git' })
    expect(await removeWorktree(root, dirty, false)).toEqual({ ok: true })
    expect(git(root, 'branch', '--list', 'dirty')).toContain('dirty')
  })

  it('removes a worktree whose folder is gone by path, leaving other stale entries alone', async () => {
    const goneA = join(base, 'gone-a')
    const goneB = join(base, 'gone-b')
    git(root, 'worktree', 'add', '-q', '-b', 'gone-a', goneA)
    git(root, 'worktree', 'add', '-q', '-b', 'gone-b', goneB)
    rmSync(goneA, { recursive: true })
    rmSync(goneB, { recursive: true })
    expect((await byPath(root, goneA)).prunable).toMatch(/gitdir/)
    expect(await removeWorktree(root, goneA, false)).toEqual({ ok: true })
    const listed = (await listWorktrees(root, []))!.worktrees.map((w) => w.path)
    expect(listed).not.toContain(goneA)
    expect(listed).toContain(goneB)
  })

  it('details only the worktrees asked for', async () => {
    const listing = (await listWorktrees(root, [], [root]))!
    expect(listing.worktrees.find((w) => w.path === root)?.detailed).toBe(true)
    expect(listing.worktrees.filter((w) => w.path !== root).every((w) => !w.detailed)).toBe(true)
  })
})

describe('untracked symbolic links are not uncommitted work (PRD v1.217)', () => {
  let root: string
  let outside: string
  beforeAll(() => {
    root = repo('link-repo')
    // Somewhere outside every worktree: what the links point at must survive the worktree.
    outside = join(base, 'outside-deps')
    mkdirSync(outside)
    writeFileSync(join(outside, 'dep.js'), 'export const dep = 1\n')
  })

  it('a worktree whose only uncommitted entry is an untracked symlink is clean, and removing it keeps the target', async () => {
    const linked = join(base, 'linked')
    git(root, 'worktree', 'add', '-q', '-b', 'jacob/linked', linked)
    // A repository ignoring `node_modules/` only matches folders: git reports this link as an untracked file.
    symlinkSync(outside, join(linked, 'node_modules'))
    expect(await byPath(root, linked)).toMatchObject({ added: 0, removed: 0, dirtyFiles: [], dirtyCount: 0 })
    expect(await removeWorktree(root, linked, false)).toEqual({ ok: true })
    expect(existsSync(linked)).toBe(false)
    expect(git(root, 'branch', '--list', 'jacob/linked')).toContain('jacob/linked')
    // Only the link went; its target and its content are untouched.
    expect(lstatSync(outside).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(outside, 'dep.js'), 'utf8')).toBe('export const dep = 1\n')
  })

  it('the same with a broken symlink', async () => {
    const broken = join(base, 'linked-broken')
    git(root, 'worktree', 'add', '-q', '-b', 'jacob/broken-link', broken)
    symlinkSync(join(base, 'nowhere'), join(broken, 'node_modules'))
    expect(await byPath(root, broken)).toMatchObject({ dirtyCount: 0, dirtyFiles: [] })
    expect(await removeWorktree(root, broken, false)).toEqual({ ok: true })
    expect(existsSync(broken)).toBe(false)
    expect(git(root, 'branch', '--list', 'jacob/broken-link')).toContain('jacob/broken-link')
  })

  it('an untracked symlink next to an untracked file still counts, and nothing is unlinked', async () => {
    const mixed = join(base, 'linked-mixed')
    git(root, 'worktree', 'add', '-q', '-b', 'jacob/mixed', mixed)
    symlinkSync(outside, join(mixed, 'node_modules'))
    writeFileSync(join(mixed, 'wip.ts'), 'export const wip = 1\n')
    expect(await byPath(root, mixed)).toMatchObject({ dirtyCount: 1, dirtyFiles: ['wip.ts'] })
    expect(await removeWorktree(root, mixed, false)).toEqual({ ok: false, reason: 'dirty' })
    expect(lstatSync(join(mixed, 'node_modules')).isSymbolicLink()).toBe(true)
    expect(existsSync(join(mixed, 'wip.ts'))).toBe(true)
  })

  it('a tracked symlink that changed still counts as uncommitted work', async () => {
    const tracked = join(base, 'linked-tracked')
    git(root, 'worktree', 'add', '-q', '-b', 'jacob/tracked-link', tracked)
    symlinkSync(outside, join(tracked, 'deps'))
    git(tracked, 'add', 'deps')
    git(tracked, 'commit', '-q', '-m', 'track the link')
    expect((await byPath(root, tracked)).dirtyCount).toBe(0)
    unlinkSync(join(tracked, 'deps'))
    symlinkSync(join(outside, 'dep.js'), join(tracked, 'deps'))
    expect(await byPath(root, tracked)).toMatchObject({ dirtyCount: 1, dirtyFiles: ['deps'] })
    expect(await removeWorktree(root, tracked, false)).toEqual({ ok: false, reason: 'dirty' })
  })

  it('an untracked folder holding a symlink still counts as uncommitted work', async () => {
    const folder = join(base, 'linked-folder')
    git(root, 'worktree', 'add', '-q', '-b', 'jacob/folder-link', folder)
    mkdirSync(join(folder, 'cache'))
    symlinkSync(outside, join(folder, 'cache', 'deps'))
    expect(await byPath(root, folder)).toMatchObject({ dirtyCount: 1, dirtyFiles: ['cache/'] })
    expect(await removeWorktree(root, folder, false)).toEqual({ ok: false, reason: 'dirty' })
    expect(lstatSync(join(folder, 'cache', 'deps')).isSymbolicLink()).toBe(true)
  })
})

describe('a worktree that stays keeps its untracked links (PRD v1.217 review)', () => {
  let root: string
  let outside: string
  beforeAll(() => {
    // A checked-out submodule is the simplest way to make `git worktree remove` refuse after every check passed: git
    // will not remove a working tree that contains one without --force, which Wavi only offers for its own refusal.
    repo('sub-source')
    root = repo('sub-repo')
    git(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', '../sub-source', 'dep')
    git(root, 'commit', '-q', '-m', 'add the submodule')
    outside = join(base, 'sub-outside')
    mkdirSync(outside)
    writeFileSync(join(outside, 'dep.js'), 'export const dep = 1\n')
  })

  /** A worktree of `root` with its submodule checked out, ready to be refused (branches are unique per test). */
  const submoduleWorktree = (name: string): string => {
    const path = join(base, name)
    git(root, 'worktree', 'add', '-q', '-b', `jacob/${name}`, path)
    git(path, '-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', '-q')
    return path
  }

  it('a git refusal after the links went puts them back', async () => {
    const path = submoduleWorktree('refused-one')
    symlinkSync(outside, join(path, 'node_modules'))
    expect((await byPath(root, path)).dirtyCount).toBe(0)
    expect(await removeWorktree(root, path, false)).toMatchObject({ ok: false, reason: 'submodules' })
    expect(existsSync(path)).toBe(true)
    expect(readlinkSync(join(path, 'node_modules'))).toBe(outside)
  })

  it('every link of several comes back, not only the first that went', async () => {
    const path = submoduleWorktree('refused-two')
    symlinkSync(outside, join(path, 'node_modules'))
    symlinkSync(join(outside, 'dep.js'), join(path, 'deps.js'))
    expect((await byPath(root, path)).dirtyCount).toBe(0)
    expect(await removeWorktree(root, path, false)).toMatchObject({ ok: false, reason: 'submodules' })
    expect(readlinkSync(join(path, 'node_modules'))).toBe(outside)
    expect(readlinkSync(join(path, 'deps.js'))).toBe(join(outside, 'dep.js'))
  })

  it('a relative link target stays relative', async () => {
    const path = submoduleWorktree('refused-relative')
    symlinkSync('../sub-outside', join(path, 'node_modules'))
    expect((await byPath(root, path)).dirtyCount).toBe(0)
    expect(await removeWorktree(root, path, false)).toMatchObject({ ok: false, reason: 'submodules' })
    // readlink gives the string git saw: put back as it was, not resolved.
    expect(readlinkSync(join(path, 'node_modules'))).toBe('../sub-outside')
  })

  it('refuses a link whose parent folder really sits outside the worktree', async () => {
    // Git never reports a path under a symlinked folder (it lists the folder's link instead), so the guard is checked
    // on its own. `removeWorktree` uses exactly this answer before it unlinks anything.
    const worktree = join(base, 'guard-wt')
    mkdirSync(worktree)
    const real = realpathSync(worktree)
    expect(await parentInsideWorktree(real, join(worktree, 'node_modules'))).toBe(true)
    symlinkSync(outside, join(worktree, 'sub'))
    // The path string is inside; the folder it sits in is a link out of the worktree.
    expect(await parentInsideWorktree(real, join(worktree, 'sub', 'node_modules'))).toBe(false)
    // A parent that cannot be resolved is not inside either.
    expect(await parentInsideWorktree(real, join(worktree, 'missing', 'node_modules'))).toBe(false)
  })
})

describe('a bare repository with worktrees', () => {
  it('has no main checkout: no linked worktree is taken for 主目录', async () => {
    const source = repo('bare-source')
    const bare = join(base, 'bare.git')
    git(base, 'clone', '-q', '--bare', source, bare)
    const first = join(base, 'bare-first')
    const second = join(base, 'bare-second')
    git(bare, 'worktree', 'add', '-q', first, 'main')
    git(bare, 'worktree', 'add', '-q', '-b', 'second', second)
    roots.add(first)
    const listing = (await listWorktrees(first, []))!
    expect(listing.worktrees.map((w) => [w.path, w.isMain])).toEqual([
      [first, false],
      [second, false]
    ])
    // The project folder itself is still never removed from under the project.
    expect(await removeWorktree(first, first, false)).toEqual({ ok: false, reason: 'main' })
    expect(await removeWorktree(first, second, false)).toEqual({ ok: true })
  })
})

describe('Wavi’s own snapshot worktrees (PRD v1.218)', () => {
  let root: string
  beforeAll(() => {
    root = repo('snapshot-repo')
  })

  /** `commit-tree` on HEAD's tree, made the way `wavi run --base snapshot` makes one (Wavi as author and committer). */
  const snapshotCommit = (
    cwd: string,
    message = SNAPSHOT_SUBJECT,
    author = { name: SNAPSHOT_AUTHOR_NAME, email: SNAPSHOT_AUTHOR_EMAIL }
  ): string =>
    execFileSync(
      'git',
      ['-c', 'commit.gpgsign=false', 'commit-tree', git(cwd, 'rev-parse', 'HEAD^{tree}').trim(), '-p', 'HEAD', '-m', message],
      {
        cwd,
        env: {
          ...env,
          GIT_AUTHOR_NAME: author.name,
          GIT_AUTHOR_EMAIL: author.email,
          GIT_COMMITTER_NAME: author.name,
          GIT_COMMITTER_EMAIL: author.email
        }
      }
    )
      .toString()
      .trim()

  const detachedAt = (name: string, commit: string): string => {
    const path = join(base, name)
    git(root, 'worktree', 'add', '-q', '--detach', path, commit)
    return path
  }

  it('lists a worktree detached at a snapshot commit with nothing unreachable, and removes it', async () => {
    const path = detachedAt('snapshot', snapshotCommit(root))
    expect(await byPath(root, path)).toMatchObject({ branch: null, unreachableCommits: 0, snapshot: true, dirtyCount: 0 })
    expect(await removeWorktree(root, path, false)).toEqual({ ok: true })
    expect(existsSync(path)).toBe(false)
  })

  it('still counts and refuses a user’s own commit on no branch', async () => {
    const path = detachedAt('own-commit', git(root, 'rev-parse', 'HEAD').trim())
    git(path, 'commit', '-q', '--allow-empty', '-m', 'only here')
    expect(await byPath(root, path)).toMatchObject({ unreachableCommits: 1, snapshot: false })
    expect(await removeWorktree(root, path, false)).toMatchObject({ ok: false, reason: 'unreachable-commits', message: '1' })
    expect(existsSync(path)).toBe(true)
  })

  it('counts the user’s commit on top of a snapshot, and refuses', async () => {
    const path = detachedAt('snapshot-plus-own', snapshotCommit(root))
    git(path, 'commit', '-q', '--allow-empty', '-m', 'mine on top')
    expect(await byPath(root, path)).toMatchObject({ unreachableCommits: 1, snapshot: false })
    expect(await removeWorktree(root, path, false)).toMatchObject({ ok: false, reason: 'unreachable-commits', message: '1' })
    expect(existsSync(path)).toBe(true)
  })

  it('counts a commit whose subject is Wavi snapshot but whose author is someone else', async () => {
    const path = detachedAt('snapshot-subject-only', snapshotCommit(root, SNAPSHOT_SUBJECT, { name: 't', email: 't@t' }))
    expect(await byPath(root, path)).toMatchObject({ unreachableCommits: 1, snapshot: false })
    expect(await removeWorktree(root, path, false)).toMatchObject({ ok: false, reason: 'unreachable-commits' })
    // A snapshot whose author matches but subject does not is no snapshot either.
    const otherMessage = detachedAt('snapshot-message', snapshotCommit(root, 'Wavi snapshot (but not)'))
    expect(await byPath(root, otherMessage)).toMatchObject({ unreachableCommits: 1, snapshot: false })
  })
})

describe('discard and delete (PRD v1.218)', () => {
  let root: string
  beforeAll(() => {
    root = repo('discard-repo')
  })

  it('is refused without discard and removes a modified tracked file and an untracked one with it, branch kept', async () => {
    const path = join(base, 'discard-me')
    git(root, 'worktree', 'add', '-q', '-b', 'jacob/discard', path)
    writeFileSync(join(path, 'README.md'), '# changed\n')
    writeFileSync(join(path, 'wip.ts'), 'export const wip = 1\n')
    expect(await byPath(root, path)).toMatchObject({ dirtyCount: 2, dirtyFiles: ['README.md', 'wip.ts'] })
    expect(await removeWorktree(root, path, false)).toEqual({ ok: false, reason: 'dirty' })
    expect(await removeWorktree(root, path, false, true)).toEqual({ ok: true })
    expect(existsSync(path)).toBe(false)
    expect(git(root, 'branch', '--list', 'jacob/discard')).toContain('jacob/discard')
  })

  it('does not get past a lock, the main checkout, or a detached HEAD with a commit of the user’s', async () => {
    const locked = join(base, 'discard-locked')
    git(root, 'worktree', 'add', '-q', '-b', 'jacob/locked', locked)
    writeFileSync(join(locked, 'wip.ts'), 'wip\n')
    git(root, 'worktree', 'lock', locked)
    expect(await removeWorktree(root, locked, false, true)).toEqual({ ok: false, reason: 'locked' })
    git(root, 'worktree', 'unlock', locked)
    expect(existsSync(locked)).toBe(true)

    writeFileSync(join(root, 'README.md'), '# changed\n')
    expect(await removeWorktree(root, root, false, true)).toEqual({ ok: false, reason: 'main' })
    git(root, 'checkout', '--', 'README.md')

    const detached = join(base, 'discard-detached')
    git(root, 'worktree', 'add', '-q', '--detach', detached)
    git(detached, 'commit', '-q', '--allow-empty', '-m', 'only here')
    writeFileSync(join(detached, 'wip.ts'), 'wip\n')
    expect(await removeWorktree(root, detached, false, true)).toMatchObject({ ok: false, reason: 'unreachable-commits' })
    expect(existsSync(detached)).toBe(true)
  })

  it('ignores anything but the literal true, as force does', async () => {
    const path = join(base, 'discard-literal')
    git(root, 'worktree', 'add', '-q', '-b', 'jacob/literal', path)
    writeFileSync(join(path, 'wip.ts'), 'wip\n')
    for (const value of ['true', 1, {}] as const) {
      expect(await removeWorktree(root, path, false, value)).toEqual({ ok: false, reason: 'dirty' })
    }
    expect(existsSync(path)).toBe(true)
  })
})
