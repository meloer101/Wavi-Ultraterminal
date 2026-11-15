// The base branch as main moves it by itself: which checkout has it out, fetching its remote branch, fast-forwarding it
// to that (合并's catch-up, the push node's pull first, catching up after a PR merged and in 同步), and the lock that keeps
// two of Wavi's own operations from moving the same base at once (合并, 推送 of the base, its pull first, 提交 on it).
import { realpath } from 'node:fs/promises'
import { trackedDirtyPaths } from '@shared/git-merge'
import { parseWorktreePorcelain, type PorcelainWorktree } from '@shared/git-worktrees'
import { operationOnBranch } from './operation'
import { git, gitOut, lastLines, pinned, pushEnv, type Ran } from './run'

const FETCH_TIMEOUT_MS = 60_000
/** A fast-forward checks files out. */
const CHECKOUT_TIMEOUT_MS = 5 * 60_000

const realOrSelf = (path: string): Promise<string> => realpath(path).catch(() => path)

/** The entry of `listing` (`git worktree list --porcelain`, parsed) that has `branch` out; bare entries never do. */
export function checkoutIn(listing: readonly PorcelainWorktree[], branch: string): PorcelainWorktree | undefined {
  return listing.find((entry) => !entry.bare && entry.branch === branch)
}

/** The checkout (its real path) that has `branch` out, or null when none has. */
export async function checkoutOf(cwd: string, branch: string): Promise<string | null> {
  const entry = checkoutIn(parseWorktreePorcelain(await gitOut(cwd, ['worktree', 'list', '--porcelain'])), branch)
  return entry ? realOrSelf(entry.path) : null
}

/** Fetches only the base's branch on `remote` into its remote-tracking ref, forced as git's default refspec is (a remote
 *  branch that was rewritten still comes in). */
export async function fetchBase(cwd: string, remote: string, remoteRef: string, tracking: string): Promise<Ran> {
  return git(cwd, pinned.fetch('--quiet', '--', remote, `+${remoteRef}:${tracking}`), { timeout: FETCH_TIMEOUT_MS, env: await pushEnv(cwd) })
}

/** What fastForwardBase did: moved or not (already there), or why it left the base alone. */
export type FastForward =
  | { ok: true; moved: boolean }
  | { ok: false; reason: 'diverged' | 'busy' | 'dirty' | 'moved' | 'failed'; message: string; files?: string[] }

const commitOf = async (cwd: string, ref: string): Promise<string> => (await gitOut(cwd, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`])).trim()

/**
 * Moves the local `base` forward to `to` (a ref, e.g. its remote-tracking ref; `name` is how the messages call it), only
 * forward and only when nothing is in the way: refused when the base has commits `to` lacks, while a merge, rebase,
 * cherry-pick or revert is in progress on the base in any checkout, and when the checkout that has the base out has
 * uncommitted changes to files the fast-forward changes. That checkout moves with `merge --ff-only` (its files follow)
 * while its HEAD is still the base's old tip; with none, the ref moves by compare-and-swap (`update-ref` with the old
 * value). A base already at or past `to`, or a ref that is missing, does not move.
 */
export async function fastForwardBase(cwd: string, base: string, to: string, name: string): Promise<FastForward> {
  const baseRef = `refs/heads/${base}`
  const [old, target] = await Promise.all([commitOf(cwd, baseRef), commitOf(cwd, to)])
  if (!old || !target || old === target) return { ok: true, moved: false }
  if ((await git(cwd, ['merge-base', '--is-ancestor', target, old])).code === 0) return { ok: true, moved: false }
  if ((await git(cwd, ['merge-base', '--is-ancestor', old, target])).code !== 0) {
    return { ok: false, reason: 'diverged', message: `${base} 和 ${name} 各有对方没有的提交，没法快进` }
  }
  const listing = parseWorktreePorcelain(await gitOut(cwd, ['worktree', 'list', '--porcelain']))
  const busy = await operationOnBranch(listing, base)
  if (busy) return { ok: false, reason: 'busy', message: `${base} 有进行中的 ${busy}，没有快进到 ${name}` }
  const holder = checkoutIn(listing, base)
  const cannot = (ran: Ran): FastForward => ({ ok: false, reason: 'failed', message: `没能快进 ${base}：${lastLines(ran.stderr || ran.stdout)}` })
  if (!holder) {
    const ran = await git(cwd, ['update-ref', '-m', `wavi: fast-forward ${base} to ${name}`, baseRef, target, old])
    return ran.code === 0 ? { ok: true, moved: true } : { ok: false, reason: 'moved', message: `${base} 在快进时又变了：再试一次` }
  }
  const status = await git(holder.path, ['status', '--porcelain=v1', '-z', '--untracked-files=no', '--ignore-submodules=dirty'])
  if (status.code !== 0) return { ok: false, reason: 'failed', message: `没能检查 ${base} 的工作区：${lastLines(status.stderr || status.stdout)}` }
  const dirty = trackedDirtyPaths(status.stdout)
  if (dirty.length > 0) {
    const changed = new Set((await gitOut(cwd, ['diff-tree', '-r', '--name-only', '-z', old, target])).split('\0').filter(Boolean))
    const touched = dirty.filter((path) => changed.has(path))
    if (touched.length > 0) return { ok: false, reason: 'dirty', message: `${base} 的工作区有未提交的改动，没有快进到 ${name}`, files: touched.slice(0, 20) }
  }
  if ((await commitOf(holder.path, 'HEAD')) !== old) return { ok: false, reason: 'moved', message: `${base} 在快进时又变了：再试一次` }
  const ran = await git(holder.path, pinned.merge('--ff-only', '--quiet', '--no-edit', target), {
    timeout: CHECKOUT_TIMEOUT_MS,
    env: { GIT_EDITOR: 'true', GIT_SEQUENCE_EDITOR: 'true' }
  })
  return ran.code === 0 ? { ok: true, moved: true } : cannot(ran)
}

// ── one of Wavi's operations per base ───────────────────────────────────────────────────────────────────────────

const heldBases = new Set<string>()

/** Why an operation on the base was refused: another of Wavi's own is moving it. */
export const baseBusyMessage = (base: string): string => `正在合并、推送或提交 ${base}：等它完成再试`

/**
 * Runs `work` while no other of Wavi's operations holds `base` of the repository at `root` (keyed by the repository's
 * real path and the branch); refuses with `refused(baseBusyMessage(base))` instead of waiting when one does.
 */
export async function withBase<T>(root: string, base: string, refused: (message: string) => T, work: () => Promise<T>): Promise<T> {
  const key = `${await realOrSelf(root)}:${base}`
  if (heldBases.has(key)) return refused(baseBusyMessage(base))
  heldBases.add(key)
  try {
    return await work()
  } finally {
    heldBases.delete(key)
  }
}
