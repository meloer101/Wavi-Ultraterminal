// A project's git worktrees for the right panel's Worktree view (PRD F17): the IPC payloads and the pure parsers
// main uses on `git worktree list --porcelain`, `git status`, `git diff --numstat`, `git for-each-ref` and reflogs.
// Approaches (not code) follow lazygit (rebase head-name, main worktree detection) and VS Code's git extension
// (only offer --force for one recognised refusal), both MIT.

/** One worktree of the repository, as main read it. Paths are absolute. */
/** Where Wavi puts new worktrees, under the home folder: `~/.tr/worktrees/<repo folder name>/<name>` (PRD F4). */
export const WAVI_WORKTREES_DIR = ['.tr', 'worktrees'] as const

/**
 * Wavi's own snapshot commits (PRD F21 `--base snapshot`, F17 v1.218): a commit-tree of a working tree, on no branch
 * by construction. Main does not count them as commits removal would orphan (worktree-create makes them with these).
 */
export const SNAPSHOT_AUTHOR_NAME = 'Wavi'
export const SNAPSHOT_AUTHOR_EMAIL = 'wavi@localhost'
export const SNAPSHOT_SUBJECT = 'Wavi snapshot'

export interface GitWorktreeInfo {
  /** Path as `git worktree list` prints it. */
  path: string
  /** `path` with symlinks resolved (equals `path` when it no longer exists). */
  realPath: string
  /** Commit checked out; null for an unborn branch. */
  head: string | null
  /** Short branch name (`refs/heads/` stripped); null when detached. */
  branch: string | null
  /** The repository's main checkout. False for every entry of a bare repository's worktrees. */
  isMain: boolean
  locked: boolean
  /** The folder is gone; why, in git's words (`prunable <reason>`), or null when it is there. */
  prunable: string | null
  /** Branch being rebased in this worktree (it shows as detached meanwhile), else null. */
  rebasing: string | null
  /**
   * Detached only: commits of HEAD that no branch, tag or remote has (removing the worktree would orphan them), Wavi's
   * own snapshot commits aside; null when that could not be checked. Always 0 on a branch.
   */
  unreachableCommits: number | null
  /**
   * Detached at a commit Wavi made as a snapshot (author, email and subject all match): its working tree is a copy, so
   * removing it orphans nothing of the user's (PRD F17 v1.218). False in every other case.
   */
  snapshot: boolean
  /** Branch the ahead / behind and merged state compare with; null for the base itself or when there is none. */
  base: string | null
  /** Commits on HEAD that `base` does not have (null without a base). */
  ahead: number | null
  behind: number | null
  /** Merged into `base`: nothing ahead, and the branch's reflog shows it had commits of its own (see isMergedInto). */
  merged: boolean
  /** Uncommitted line stats vs HEAD (`git diff --numstat HEAD`; untracked files are not counted). */
  added: number
  removed: number
  /** Uncommitted paths (tracked changes and untracked files), at most MAX_DIRTY_FILES. Not an untracked symlink. */
  dirtyFiles: string[]
  /**
   * All uncommitted paths; null when `git status` failed (unknown is never treated as clean). An untracked symbolic
   * link is not counted (v1.217): it holds no content, so removing the worktree only drops the link.
   */
  dirtyCount: number | null
  /** False when this listing skipped the per-worktree details (a partial refresh); keep the previous ones. */
  detailed: boolean
}

export interface GitWorktreeListing {
  /** Branch new worktrees fork from and merge back into: origin's HEAD, else main / master, else the main checkout's. */
  mainBranch: string | null
  worktrees: GitWorktreeInfo[]
  /** Resolved path of each `knownPaths` entry the renderer asked about (missing ones are left out). */
  realPaths: Record<string, string>
}

export type WorktreeRemoveRefusal =
  /** uncommitted changes (including untracked files) */
  | 'dirty'
  /** git could not tell whether there is uncommitted work or orphaned commits */
  | 'unverified'
  /** a detached HEAD with commits no branch / tag / remote has */
  | 'unreachable-commits'
  /** a rebase is in progress there */
  | 'busy'
  | 'locked'
  /** the main checkout (or the project folder itself) */
  | 'main'
  /** not a worktree of this repository */
  | 'unknown'
  /** git refuses because of submodules: the one refusal `force` may get past */
  | 'submodules'
  /** any other git error */
  | 'git'

export type WorktreeRemoveResult = { ok: true } | { ok: false; reason: WorktreeRemoveRefusal; message?: string }

export const MAX_DIRTY_FILES = 50

/** A raw entry of `git worktree list --porcelain`. */
export interface PorcelainWorktree {
  path: string
  head: string | null
  branch: string | null
  bare: boolean
  detached: boolean
  locked: boolean
  /** `prunable <reason>`: the reason ('' when git gave none); null when not prunable. */
  prunable: string | null
}

/**
 * Parses `git worktree list --porcelain` (one attribute per line, blank line between worktrees; paths with newlines
 * are not supported, as in git's own non-z output).
 */
export function parseWorktreePorcelain(output: string): PorcelainWorktree[] {
  const result: PorcelainWorktree[] = []
  let current: PorcelainWorktree | null = null
  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), head: null, branch: null, bare: false, detached: false, locked: false, prunable: null }
      result.push(current)
      continue
    }
    if (!current) continue
    const space = line.indexOf(' ')
    const key = space < 0 ? line : line.slice(0, space)
    const value = space < 0 ? '' : line.slice(space + 1)
    if (key === 'HEAD') current.head = /^0+$/.test(value) ? null : value
    else if (key === 'branch') current.branch = value.replace(/^refs\/heads\//, '')
    else if (key === 'bare') current.bare = true
    else if (key === 'detached') current.detached = true
    else if (key === 'locked') current.locked = true
    else if (key === 'prunable') current.prunable = value
  }
  return result
}

/**
 * `git log --format=%an%x00%ae%x00%s <head> --not --branches --tags --remotes`: how many commits are not Wavi snapshot
 * commits, and whether the first line (HEAD) is one. Throws when git printed something else: unknown is never safe.
 */
export function parseUnreachableLog(output: string): { commits: number; headIsSnapshot: boolean } {
  const lines = output.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  let commits = 0
  let headIsSnapshot = false
  for (const [index, line] of lines.entries()) {
    const fields = line.split('\0')
    if (fields.length !== 3) throw new Error('unexpected git log output')
    const snapshot =
      fields[0] === SNAPSHOT_AUTHOR_NAME && fields[1] === SNAPSHOT_AUTHOR_EMAIL && fields[2] === SNAPSHOT_SUBJECT
    if (index === 0) headIsSnapshot = snapshot
    if (!snapshot) commits++
  }
  return { commits, headIsSnapshot }
}

/**
 * The main checkout is the first entry of `git worktree list`, unless that entry is the bare repository itself: then
 * every worktree is a linked one. Decided before bare entries are dropped.
 */
export function mainWorktreeIndex(entries: readonly Pick<PorcelainWorktree, 'bare'>[]): number | null {
  return entries.length > 0 && !entries[0]!.bare ? 0 : null
}

/** Sums `git diff --numstat` lines ("added\tremoved\tpath"); binary files ("-\t-") count as no lines. */
export function parseNumstat(output: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of output.split('\n')) {
    const [a, r] = line.split('\t')
    if (a === undefined || r === undefined) continue
    added += Number.parseInt(a, 10) || 0
    removed += Number.parseInt(r, 10) || 0
  }
  return { added, removed }
}

/** `git rev-list --left-right --count <base>...<head>` prints "behind\tahead" (left = only in base). */
export function parseAheadBehind(output: string): { ahead: number; behind: number } | null {
  const match = /^(\d+)\s+(\d+)\s*$/.exec(output.trim())
  if (!match) return null
  return { behind: Number(match[1]), ahead: Number(match[2]) }
}

/**
 * `git for-each-ref --format='%(refname:short)%00%(ahead-behind:<base>)' refs/heads` (git ≥ 2.41): one line per
 * branch, "name\0ahead behind". Null when the output is not in that shape (older git prints the atom literally or fails).
 */
export function parseForEachRefAheadBehind(output: string): Record<string, { ahead: number; behind: number }> | null {
  const result: Record<string, { ahead: number; behind: number }> = {}
  for (const line of output.split('\n')) {
    if (line === '') continue
    const [name, counts] = line.split('\0')
    const match = counts ? /^(\d+) (\d+)$/.exec(counts.trim()) : null
    if (!name || !match) return null
    result[name] = { ahead: Number(match[1]), behind: Number(match[2]) }
  }
  return result
}

/**
 * Whether a branch ever had commits of its own, from its reflog subjects (`git reflog show --format=%gs <ref>`):
 * "commit: …", "commit (amend): …", "commit (merge): …", "cherry-pick: …", "revert: …". Creation, fast-forwards and
 * resets do not count. A missing reflog (empty) proves nothing.
 */
export function hadOwnCommits(reflogSubjects: string): boolean {
  return reflogSubjects.split('\n').some((line) => /^(commit|cherry-pick|revert)\b/.test(line.trim()))
}

/**
 * Merged into the base: nothing on HEAD is missing from the base, and the branch made commits of its own. A worktree
 * whose agent has not committed yet has nothing ahead too, but is not merged (no commits of its own).
 */
export function isMergedInto(ahead: number | null, ownCommits: boolean): boolean {
  return ahead === 0 && ownCommits
}

/** The branch a rebase works on, from `<gitdir>/rebase-merge/head-name` or `rebase-apply/head-name`. */
export function parseRebaseHeadName(text: string): string | null {
  const name = text.trim()
  if (!name || name === 'detached HEAD') return null
  return name.replace(/^refs\/heads\//, '')
}

/** Which refusal a failed `git worktree remove` was; only 'submodules' may be retried with --force. */
export function classifyRemoveError(message: string): 'submodules' | 'dirty' | 'locked' | 'git' {
  if (/containing submodules/i.test(message)) return 'submodules'
  if (/contains modified or untracked files/i.test(message)) return 'dirty'
  if (/is locked|locked working tree/i.test(message)) return 'locked'
  return 'git'
}

/**
 * The branch that counts as "main": origin's default branch when it exists locally, else `main` / `master`, else
 * what the main checkout has out.
 */
export function pickMainBranch(localBranches: readonly string[], originHead: string | null, mainCheckoutBranch: string | null): string | null {
  const fromOrigin = originHead?.replace(/^origin\//, '') ?? null
  if (fromOrigin && localBranches.includes(fromOrigin)) return fromOrigin
  for (const name of ['main', 'master']) if (localBranches.includes(name)) return name
  return mainCheckoutBranch
}

/**
 * Base branch per branch from `git config --get-regexp '^branch\..*\.base$'` ("branch.<name>.base <base>" lines).
 * Branch names may contain dots, so the key is cut at the last ".base".
 */
export function parseBaseConfig(output: string): Record<string, string> {
  const bases: Record<string, string> = {}
  for (const line of output.split('\n')) {
    const match = /^branch\.(.+)\.base (.+)$/.exec(line.trim())
    if (match) bases[match[1]!] = match[2]!.replace(/^refs\/heads\//, '')
  }
  return bases
}

/** Whether a `.git` path (relative to the common dir) is something the worktree list depends on. */
export function affectsWorktreeList(relative: string): boolean {
  const path = relative.split('\\').join('/')
  return (
    path === 'HEAD' ||
    path === 'packed-refs' ||
    path === 'worktrees' ||
    /^worktrees\/[^/]+$/.test(path) ||
    /^worktrees\/[^/]+\/(HEAD|locked)$/.test(path) ||
    path.startsWith('refs/heads/')
  )
}
