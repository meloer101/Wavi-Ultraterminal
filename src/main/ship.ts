// The merge chain's mechanical side in main (PRD F16 v1.78, Figma 29): preflight, the agent handoff files, 合并 (local)
// and 推送 of the base, the push node's pull first (prepush), the diff a fix adds, risk markers, and CI on the base Wavi
// pushed. Channels in SHIP_IPC (src/shared/ship.ts).
//
// The agent in the session writes every piece of text and fixes code; this file runs commit, merge, push and gh, and
// the brakes. Everything the renderer sends is validated (src/shared/ship-requests.ts) and every worktree must be one
// of a workspace project. gh is the user's own login (see pull-requests.ts); nothing here stores a token.
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, open, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { BrowserWindow, ipcMain } from 'electron'
import { classifyGitFailure, type GitFailure, type GitFailureContext, type GitStep } from '@shared/git-failures'
import { operationInProgress, trackedDirtyPaths, type GitOperation, type MergeBlocker, type MergeConflict, type MergePrecheck, type MergeResult } from '@shared/git-merge'
import { hadOwnCommits, parseWorktreePorcelain } from '@shared/git-worktrees'
import {
  nextPollDelay,
  isRateLimited,
  isSignedOut,
  parsePrTarget,
  parseRepoMergeMethods,
  REPO_MERGE_QUERY,
  summarizeChecks,
  type ChecksSummary,
  type GitHubRepo,
  type RepoMergeMethods
} from '@shared/pull-requests'
import { riskMarkers, type RiskMarker } from '@shared/risk-markers'
import {
  SHIP_IPC,
  type BaseCi,
  type BaseCiFailure,
  type DiffSinceAnswer,
  type DiffSinceRequest,
  type HandoffSlot,
  type ShipMainRequest,
  type ShipMainResult,
  type ShipOperation,
  type ShipOperationResult,
  type CommitRange,
  type ShipPreflight,
  type ShipPrepushResult,
  type ShipPullResult,
  type ShipSyncResult
} from '@shared/ship'
import { CHAIN_TEXT } from '@shared/ship-chain'
import { HANDOFF_FILES } from '@shared/ship-handoff'
import { parseDiffSinceRequest, parseHandoffRequest, parsePrepushRequest, parsePushBaseRequest, parseShipMainRequest, parseShipOperationRequest } from '@shared/ship-requests'
import { baseMergeCheck, mergePrecheck, mergeTreeConflicts, mergeWorktree, pushBase } from './git-merge'
import { baseCompareRef } from './git-graph'
import { baseRemoteFor, remoteFor } from './git/remote'
import { git, gitEnv, gitOut, lastLines, NO_OPTIONAL_LOCKS, pinned, pushEnv, refExists, searchPath, type Ran } from './git/run'
import { branchInfo, catchUpBase, commitWorktree, detectGh, failedLogs, gh, ghPausedUntil, gitHubRepoFromUrl, openPrNumber, pauseGhForRateLimit, prRepoFor, uncommittedFiles } from './pull-requests'
import { isProjectRoot } from './workspace-store'

const FETCH_TIMEOUT_MS = 60_000
/** A fast-forward checks files out. */
const CHECKOUT_TIMEOUT_MS = 5 * 60_000
/** How long a branch-protection or merge-settings answer is trusted. */
const PROTECTION_TTL_MS = 10 * 60_000
const HANDOFF_READ_CAP = 64 * 1024
const DIFF_SINCE_CAP = 2 * 1024 * 1024
const RISK_DIFF_CAP = 4 * 1024 * 1024
/** CI of a pushed commit: asked this often while it runs. */
const CI_POLL_MS = 60_000
/** A fresh push has no check runs for a few seconds: no checks inside this window read as "pending", not "none". */
const CI_NO_CHECKS_GRACE_MS = 90_000
/** A commit whose checks never settle is dropped after this long. */
const CI_WATCH_MAX_MS = 6 * 60 * 60_000
/** Failures in a row before a watch that never got an answer gives up (not a GitHub repository, no access). */
const CI_GIVE_UP_FAILURES = 5
/** An explicit refresh closer than this to the last poll reuses it. */
const CI_REFRESH_MIN_MS = 10_000

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))
const isSha = (value: string): boolean => /^[0-9a-f]{40,64}$/.test(value)

async function realOrSelf(path: string): Promise<string> {
  return realpath(path).catch(() => path)
}

// ── what a worktree's chain starts from ─────────────────────────────────────────────────────────────────────────

async function countCommits(cwd: string, range: string): Promise<number | null> {
  const ran = await git(cwd, ['rev-list', '--count', range, '--'])
  return ran.code === 0 ? Number(ran.stdout.trim()) || 0 : null
}

/** Where a branch was pushed: the remote, the branch there, and its remote-tracking ref when one exists. */
interface PushedTo {
  remote: string
  /** e.g. refs/heads/feat */
  remoteRef: string
  /** e.g. refs/remotes/origin/feat; null when git keeps none (a single-branch or shallow clone fetches only its branch). */
  tracking: string | null
}

/**
 * Where the branch was pushed: its upstream (an upstream that is the base does not count, see branchInfo), also when no
 * remote-tracking ref of it exists; else `<remote>/<branch>` when that remote-tracking ref exists; null when the branch
 * was never pushed.
 */
async function pushedTo(cwd: string, info: { branch: string | null; remote: string | null; remoteRef: string | null }, remote: string | null): Promise<PushedTo | null> {
  if (info.remote && info.remote !== '.' && info.remoteRef) {
    const tracking = `refs/remotes/${info.remote}/${info.remoteRef.slice('refs/heads/'.length)}`
    return { remote: info.remote, remoteRef: info.remoteRef, tracking: (await refExists(cwd, tracking)) ? tracking : null }
  }
  if (!info.branch || !remote) return null
  const same = `refs/remotes/${remote}/${info.branch}`
  return (await refExists(cwd, same)) ? { remote, remoteRef: `refs/heads/${info.branch}`, tracking: same } : null
}

/** The refspec that fetches the pushed branch: into its remote-tracking ref when there is one, else only FETCH_HEAD. */
const pushedRefspec = (pushed: PushedTo): string => (pushed.tracking ? `+${pushed.remoteRef}:${pushed.tracking}` : pushed.remoteRef)

/** Paths git lists as unmerged (a stopped merge, rebase or cherry-pick). */
async function unresolvedPaths(cwd: string): Promise<string[]> {
  return (await gitOut(cwd, ['diff', '--name-only', '--diff-filter=U', '-z'])).split('\0').filter(Boolean)
}

/** The merge, rebase or cherry-pick stopped in the worktree (a revert is not reported), with its unresolved paths. */
async function operationOf(cwd: string): Promise<ShipOperation | null> {
  const gitDir = (await gitOut(cwd, ['rev-parse', '--absolute-git-dir'])).trim()
  if (!gitDir) return null
  let kind: GitOperation | null
  try {
    kind = operationInProgress(await readdir(gitDir))
  } catch {
    return null
  }
  if (!kind || kind === 'revert') return null
  return { kind, unresolved: await unresolvedPaths(cwd) }
}

/** What a failed git printed, both streams (hooks print to either). */
const printed = (ran: Ran): string => [ran.stderr.trim(), ran.stdout.trim()].filter(Boolean).join('\n')

interface BaseUpstream {
  /** The remote-tracking ref, e.g. refs/remotes/origin/main. */
  ref: string
  remote: string
  /** The branch on the remote, e.g. refs/heads/main. */
  remoteRef: string
}

/** The local base's upstream, when it has one that is a remote-tracking ref Wavi can read. */
async function baseUpstream(cwd: string, base: string): Promise<BaseUpstream | null> {
  const out = (await gitOut(cwd, ['for-each-ref', '--format=%(upstream)%00%(upstream:remotename)%00%(upstream:remoteref)', `refs/heads/${base}`])).trim()
  const [ref, remote, remoteRef] = out.split('\0')
  if (!ref || !remote || remote === '.' || !remoteRef || !ref.startsWith('refs/remotes/') || !remoteRef.startsWith('refs/heads/')) return null
  return (await refExists(cwd, ref)) ? { ref, remote, remoteRef } : null
}

// ── branch protection ───────────────────────────────────────────────────────────────────────────────────────────

const protection = new Map<string, { value: boolean; at: number }>()

/** `GET repos/{o}/{r}/branches/{base}/protection`: 200 protected, 404 not, anything else unknown. Cached 10 minutes. */
async function baseProtection(cwd: string, remote: string | null, base: string): Promise<boolean | null> {
  if (!remote) return null
  if ((await detectGh()) !== 'ready' || Date.now() < ghPausedUntil()) return null
  const where = await prRepoFor(cwd, remote)
  if (!where) return null
  const { repo } = where
  const key = `${repo.host}/${repo.owner}/${repo.name}#${base}`
  const known = protection.get(key)
  if (known && Date.now() - known.at < PROTECTION_TTL_MS) return known.value
  const path = `repos/${repo.owner}/${repo.name}/branches/${base.split('/').map(encodeURIComponent).join('/')}/protection`
  const ran = await gh(['api', path, `--hostname=${repo.host}`], { timeout: 20_000 })
  const output = `${ran.stderr}\n${ran.stdout}`
  let value: boolean | null = null
  if (ran.code === 0) value = true
  else if (/HTTP 404/.test(output)) value = false
  else if (isRateLimited(output)) pauseGhForRateLimit()
  if (value !== null) protection.set(key, { value, at: Date.now() })
  return value
}

// ── merge settings ──────────────────────────────────────────────────────────────────────────────────────────────

/** How long a merge-settings miss (gh failed, or GitHub answered nothing usable) is trusted; preflight runs on every git change. */
const MERGE_SETTINGS_MISS_TTL_MS = 60_000

const mergeSettings = new Map<string, { value: RepoMergeMethods | null; at: number }>()

/**
 * The repository's allowed merge methods and the gh user's default there (GraphQL `repository{…MergeAllowed
 * viewerDefaultMergeMethod}`), or null when there is nothing on GitHub to go by. Cached 10 minutes, as protection; a
 * miss for a minute, so a failing query is not run again on every git change. A rate limit pauses gh instead.
 */
async function repoMergeSettings(cwd: string, remote: string | null): Promise<RepoMergeMethods | null> {
  if (!remote) return null
  if ((await detectGh()) !== 'ready' || Date.now() < ghPausedUntil()) return null
  const where = await prRepoFor(cwd, remote)
  if (!where) return null
  const { repo } = where
  const key = `${repo.host}/${repo.owner}/${repo.name}`
  const known = mergeSettings.get(key)
  if (known && Date.now() - known.at < (known.value ? PROTECTION_TTL_MS : MERGE_SETTINGS_MISS_TTL_MS)) return known.value
  const ran = await gh(['api', 'graphql', `--hostname=${repo.host}`, '-f', `query=${REPO_MERGE_QUERY}`, '-f', `owner=${repo.owner}`, '-f', `name=${repo.name}`], {
    timeout: 20_000
  })
  if (ran.code !== 0 && isRateLimited(`${ran.stderr}\n${ran.stdout}`)) {
    pauseGhForRateLimit()
    return null
  }
  let value: RepoMergeMethods | null = null
  if (ran.code === 0) {
    try {
      value = parseRepoMergeMethods(JSON.parse(ran.stdout) as unknown)
    } catch {
      value = null
    }
  }
  mergeSettings.set(key, { value, at: Date.now() })
  return value
}

// ── preflight ───────────────────────────────────────────────────────────────────────────────────────────────────

const failure = (message: string): { ok: false; message: string } => ({ ok: false, message })
const preflightFailure = (message: string, operation: ShipOperation | null = null): ShipPreflight => ({ ok: false, message, operation })

/** What the two exits and the chain need to know before anything runs (Figma 29A, 合入链路 v2). No network call. */
export async function shipPreflight(raw: unknown): Promise<ShipPreflight> {
  const target = parsePrTarget(raw)
  if (!target || !isProjectRoot(target.root)) return preflightFailure('请求无效')
  const info = await branchInfo(target)
  if (!info) return preflightFailure('不是这个项目的 worktree')
  const { cwd, branch, base } = info
  const operation = await operationOf(cwd)
  // A rebase leaves HEAD detached: say so, and still name it (继续 / 中止).
  if (!branch) return preflightFailure(operation ? CHAIN_TEXT.operation(operation.kind) : '处于分离 HEAD，没有分支可以合并', operation)
  // The main checkout on its base: nothing to merge or propose, but the base's own commits its upstream lacks are pushed.
  if (base === branch && (await isMainCheckout(cwd))) return basePreflight(target, cwd, branch, operation)
  if (!base || base === branch) return preflightFailure('这是基线分支本身，没有可以合并的改动', operation)
  if (!(await refExists(cwd, `refs/heads/${base}`))) return preflightFailure(`找不到基线分支 ${base}`, operation)
  // What Git · 变更 counts 已提交 against (origin/<base> when the local base is only behind it), so both agree.
  const baseRef = await baseCompareRef(cwd, base, branch)
  const [ahead, behindBase, head] = await Promise.all([
    countCommits(cwd, `${baseRef}..refs/heads/${branch}`),
    countCommits(cwd, `refs/heads/${branch}..${baseRef}`),
    gitOut(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).then((out) => out.trim())
  ])
  if (ahead === null || behindBase === null || !head) return preflightFailure(`没能数出分支比 ${base} 新的提交`, operation)
  const [check, ownCommits, remote, baseRemote, files, upstream] = await Promise.all([
    // One in-memory merge: what would conflict, and whether the work is in the base already. null: git < 2.38 or the
    // check failed (the merge's own precheck says why).
    ahead > 0 ? baseMergeCheck(cwd, baseRef, `refs/heads/${branch}`).catch(() => null) : Promise.resolve({ conflicts: [], inBase: false }),
    // Nothing ahead: merged when the branch made commits of its own (the merge sheet's 已经全部合并 vs 还没有自己的提交).
    ahead === 0 ? gitOut(cwd, ['reflog', 'show', '--format=%gs', `refs/heads/${branch}`, '--']).then(hadOwnCommits) : Promise.resolve(false),
    remoteFor(cwd, branch, base),
    // Where exit A pushes the base: its protection and merge settings are read there.
    baseRemoteFor(cwd, branch, base),
    uncommittedFiles(cwd),
    baseUpstream(cwd, base)
  ])
  const baseCounts = upstream ? await aheadBehind(cwd, upstream.ref, `refs/heads/${base}`) : null
  const baseAheadOfUpstream = baseCounts?.ahead ?? 0
  const baseBehindUpstream = baseCounts?.behind ?? 0
  /** null: no upstream to count against, or the count failed (the chain offers no 推送 of the base then). */
  const baseUnpushed: number | null = baseCounts ? baseCounts.ahead : null
  const pushed = await pushedTo(cwd, info, remote)
  // Counted only against a remote-tracking ref (no network call): a pushed branch without one has no counts.
  const branchUpstream = pushed?.tracking ? await aheadBehind(cwd, pushed.tracking, `refs/heads/${branch}`) : null
  const [baseProtected, mergeMethods, ghState, onGitHub] = await Promise.all([
    baseProtection(cwd, baseRemote, base),
    repoMergeSettings(cwd, baseRemote),
    detectGh(),
    remote ? prRepoFor(cwd, remote).then((where) => where !== null) : Promise.resolve(null)
  ])
  return {
    ok: true,
    branch,
    base,
    remote,
    baseProtected,
    suggested: baseProtected === true ? 'pr' : 'main',
    uncommitted: files.length,
    ahead,
    merged: ahead > 0 ? check?.inBase === true : ownCommits,
    baseAheadOfUpstream,
    baseBehindUpstream,
    baseUnpushed,
    openPr: openPrNumber(target.worktree),
    mergeMethods,
    head,
    gh: ghState,
    remoteOnGitHub: onGitHub,
    operation,
    behindBase,
    baseConflicts: check ? check.conflicts.map((c) => c.path) : null,
    pushed: pushed !== null,
    upstream: branchUpstream,
    baseRemote,
    pullFrom: pushed ? `${pushed.remote}/${pushed.remoteRef.replace(/^refs\/heads\//, '')}` : null
  }
}

/** Whether `cwd` is the repository's main checkout (its git dir is the common one), not a linked worktree. */
async function isMainCheckout(cwd: string): Promise<boolean> {
  const [own, common] = await Promise.all([
    gitOut(cwd, ['rev-parse', '--absolute-git-dir']),
    gitOut(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  ])
  if (!own.trim() || !common.trim()) return false
  const [a, b] = await Promise.all([realOrSelf(own.trim()), realOrSelf(common.trim())])
  return a === b
}

/** Local `ref` commits `upstream` lacks and the other way round, or null when they cannot be counted. */
async function aheadBehind(cwd: string, upstream: string, ref: string): Promise<{ ahead: number; behind: number } | null> {
  const counts = await git(cwd, ['rev-list', '--left-right', '--count', `${upstream}...${ref}`, '--'])
  if (counts.code !== 0) return null
  const [behind = '0', own = '0'] = counts.stdout.trim().split(/\s+/)
  return { ahead: Number(own) || 0, behind: Number(behind) || 0 }
}

/**
 * The preflight of the main checkout on its base (path ①): no branch of its own to merge or propose; what counts is the
 * base against its upstream (推送 of the base, as after a local 合并). No network call besides gh's state.
 */
async function basePreflight(target: { root: string; worktree: string }, cwd: string, base: string, operation: ShipOperation | null): Promise<ShipPreflight> {
  const [head, upstream, baseRemote, files, ghState] = await Promise.all([
    gitOut(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${base}`]).then((out) => out.trim()),
    baseUpstream(cwd, base),
    baseRemoteFor(cwd, base, base),
    uncommittedFiles(cwd),
    detectGh()
  ])
  if (!head) return preflightFailure(`找不到基线分支 ${base}`, operation)
  const counts = upstream ? await aheadBehind(cwd, upstream.ref, `refs/heads/${base}`) : null
  const onGitHub = baseRemote ? (await prRepoFor(cwd, baseRemote)) !== null : null
  return {
    ok: true,
    branch: base,
    base,
    remote: baseRemote,
    baseProtected: null,
    suggested: 'main',
    uncommitted: files.length,
    ahead: 0,
    merged: false,
    baseAheadOfUpstream: counts?.ahead ?? 0,
    baseBehindUpstream: counts?.behind ?? 0,
    baseUnpushed: counts ? counts.ahead : null,
    openPr: openPrNumber(target.worktree),
    mergeMethods: null,
    head,
    gh: ghState,
    remoteOnGitHub: onGitHub,
    operation,
    behindBase: 0,
    baseConflicts: [],
    pushed: upstream !== null,
    upstream: counts,
    baseRemote,
    pullFrom: upstream ? remoteName(upstream) : null,
    onBase: true
  }
}

/** `<remote>/<branch there>`, as the steps name a remote branch. */
const remoteName = (up: { remote: string; remoteRef: string }): string => `${up.remote}/${up.remoteRef.replace(/^refs\/heads\//, '')}`

// ── the agent's files ───────────────────────────────────────────────────────────────────────────────────────────

/** `<git dir>/wavi/<kind>.md` of the requested worktree, or why not. */
async function handoffPath(raw: unknown): Promise<{ dir: string; path: string } | { message: string }> {
  const request = parseHandoffRequest(raw)
  if (!request || !isProjectRoot(request.root)) return { message: '请求无效' }
  const info = await branchInfo(request)
  if (!info) return { message: '不是这个项目的 worktree' }
  const gitDir = (await gitOut(info.cwd, ['rev-parse', '--absolute-git-dir'])).trim()
  if (!gitDir) return { message: '读不到 worktree 的 git 目录' }
  const dir = join(gitDir, 'wavi')
  return { dir, path: join(dir, HANDOFF_FILES[request.kind]) }
}

/** Clears an old file of this kind and answers where the agent should write the new one. */
export async function handoffSlot(raw: unknown): Promise<HandoffSlot> {
  const where = await handoffPath(raw)
  if ('message' in where) return failure(where.message)
  try {
    await mkdir(where.dir, { recursive: true })
    await rm(where.path, { force: true })
  } catch (error) {
    return failure(`没能准备给 agent 的文件：${errorText(error)}`)
  }
  return { ok: true, path: where.path }
}

/** The text the agent wrote (at most 64 KB), or null while the file is not there. */
export async function readHandoffText(raw: unknown): Promise<string | null> {
  const where = await handoffPath(raw)
  if ('message' in where) return null
  try {
    const file = await open(where.path, 'r')
    try {
      const buffer = Buffer.alloc(HANDOFF_READ_CAP)
      const { bytesRead } = await file.read(buffer, 0, HANDOFF_READ_CAP, 0)
      return buffer.subarray(0, bytesRead).toString('utf8')
    } finally {
      await file.close()
    }
  } catch {
    return null
  }
}

// ── 合并 (and the base's 推送) ────────────────────────────────────────────────────────────────────────────────────

const operationNames: Record<GitOperation, string> = { merge: '合并', rebase: '变基', 'cherry-pick': 'cherry-pick', revert: '撤销' }

/** Why a merge cannot run, in the user's words. */
export function blockerMessage(blocker: MergeBlocker, base: string): string {
  switch (blocker.kind) {
    case 'detached':
      return '处于分离 HEAD，没有分支可以合并'
    case 'no-base':
      return '找不到要合并进的基线分支'
    case 'base-missing':
      return `基线分支 ${blocker.base} 不在本地`
    case 'busy':
      return `${blocker.where === 'worktree' ? '这个 worktree' : `${base} 的工作区`}里有进行中的${operationNames[blocker.operation]}：先完成或放弃它`
    case 'nothing':
      return blocker.merged ? `分支已经全部合并到 ${base}` : `分支没有比 ${base} 新的提交`
    case 'old-git':
      return 'git 版本低于 2.38，没法预检合并'
    case 'base-dirty':
      return `${base} 的工作区在 ${blocker.files.slice(0, 5).join('、')} 上有未提交的改动，合并会碰到它们`
    case 'main':
      return '这是主工作区（已经在基线分支上），没有可以合并的分支'
    case 'worktree-dirty':
      return '这个 worktree 有未提交的改动：变基前先提交'
    case 'unverified':
      return `没能检查合并：${blocker.message}`
  }
}

const stepFailure = (
  step: 'commit' | 'merge' | 'push',
  reason: 'blocked' | 'conflicts' | 'failed' | 'declined',
  message: string,
  more: { conflicts?: string[]; output?: string; committed?: true; failure?: GitFailure; stale?: true } = {}
): ShipMainResult => ({
  ok: false,
  step,
  reason,
  message,
  ...more
})

async function precheck(root: string, worktree: string): Promise<MergePrecheck | string> {
  try {
    return await mergePrecheck(root, worktree)
  } catch (error) {
    return errorText(error)
  }
}

/**
 * Brings the local base up to its upstream before a merge (so the push is not rejected): fetches the base (a failed
 * fetch leaves what is known), then fast-forwards the checkout that has it out, or the branch ref when none has.
 * Returns whether the base moved, or why it could not.
 */
async function syncBase(root: string, check: MergePrecheck): Promise<{ moved: boolean } | { message: string }> {
  const up = await baseUpstream(root, check.base)
  if (!up) return { moved: false }
  await git(root, pinned.fetch('--quiet', '--', up.remote, `${up.remoteRef}:${up.ref}`), { timeout: FETCH_TIMEOUT_MS, env: await pushEnv(root) })
  const behind = (await countCommits(root, `refs/heads/${check.base}..${up.ref}`)) ?? 0
  if (behind === 0) return { moved: false }
  const name = `${up.remote}/${up.remoteRef.slice('refs/heads/'.length)}`
  const cannot = (why: string): { message: string } => ({ message: `${check.base} 落后 ${name} ${behind} 个提交，没法快进${why}` })
  if (check.baseCheckout) {
    const ran = await git(check.baseCheckout, pinned.merge('--ff-only', '--quiet', '--no-edit', up.ref), { timeout: CHECKOUT_TIMEOUT_MS })
    return ran.code === 0 ? { moved: true } : cannot(`：${lastLines(ran.stderr || ran.stdout)}`)
  }
  if ((await git(root, ['merge-base', '--is-ancestor', `refs/heads/${check.base}`, up.ref])).code !== 0) {
    return { message: `${check.base} 和 ${name} 各有对方没有的提交，没法快进` }
  }
  const ran = await git(root, ['update-ref', '-m', `wavi: fast-forward ${check.base}`, `refs/heads/${check.base}`, up.ref, check.baseHead])
  return ran.code === 0 ? { moved: true } : cannot(`：${lastLines(ran.stderr || ran.stdout)}`)
}

const REBASE_GAVE_UP = '变基时遇到冲突，已放弃，分支没有变化：改用「压缩」或「合并」'

/** A rebase given up and aborted: conflicts on one of its commits (or nothing git named) keep Wavi's sentence, and no
 *  way on, since nothing is left to resolve; a class git did name (a commit that could not be signed) keeps its own. */
function gaveUp(classified: { failure: GitFailure } | Record<string, never>): GitFailure | null {
  if (!('failure' in classified)) return null
  const { failure } = classified
  return failure.kind === 'unknown' || failure.kind === 'conflicts' ? { ...failure, message: REBASE_GAVE_UP, next: null } : failure
}

function mergeFailure(result: Extract<MergeResult, { ok: false }>, check: MergePrecheck, method: ShipMainRequest['method'], remote: string | null): ShipMainResult {
  // Classified on everything git printed: its hints after a failed rebase push the reason out of the last lines.
  const printed = result.output ?? result.message
  const classified = (step: GitStep): { failure: GitFailure } | Record<string, never> =>
    printed ? { failure: classifyGitFailure(step, printed, { base: check.base, remote }) } : {}
  switch (result.reason) {
    case 'stale':
      return stepFailure('merge', 'failed', `分支或 ${check.base} 在检查之后又变了：再试一次`, { stale: true })
    case 'conflict':
      if (result.conflicts && result.conflicts.length > 0) {
        return stepFailure('merge', 'conflicts', `${result.conflicts.length} 个文件和 ${check.base} 冲突`, { conflicts: result.conflicts.map((c) => c.path) })
      }
      {
        const failure = gaveUp(classified('rebase'))
        return stepFailure('merge', 'failed', failure?.message ?? REBASE_GAVE_UP, { output: result.message, ...(failure ? { failure } : {}) })
      }
    case 'blocked':
      return stepFailure('merge', 'blocked', result.blocker ? blockerMessage(result.blocker, check.base) : '现在合并不了')
    case 'invalid':
      return stepFailure('merge', 'failed', '请求无效')
    case 'git':
      return stepFailure('merge', 'failed', `合并没有成功${result.rebased ? `（分支已变基到 ${check.base} 上）` : ''}：${result.message ?? 'git 报错'}`, {
        output: result.message,
        ...classified(method === 'rebase' ? 'rebase' : 'merge')
      })
  }
}

const shipping = new Set<string>()

/**
 * A push of the base that git refused, as the sheet shows it (the merge stays on the local base), with what git said
 * classified: a refusal of the base as protected (the class offers 改为创建 PR) is told apart from a network error, a
 * hook, or protection words that do not name the base.
 */
export function pushFailure(commit: string, base: string, push: string, remote = 'origin'): ShipMainResult {
  const failure = classifyGitFailure('push', push, { base, remote })
  const refused = failure.next === 'create-pr'
  const said = lastLines(push)
  const pushError = refused
    ? `${base} 受保护，${remote} 不收直接推送：改为创建 PR（合并已留在本地 ${base} 上）。${said}`
    : `推送到 ${remote} 失败（合并已留在本地 ${base} 上）：${said}`
  return { ok: true, commit, pushed: false, pushError, failure, ...(refused ? { pushRefused: true as const } : {}) }
}

/**
 * 合并 (exit A): commit the ticked paths with the message (hooks run), bring the base up to its upstream, merge the
 * branch into it — and only when `push` asks (自动修复 of the base), push it. The merge stays local otherwise: 推送 of
 * the base is the chain's next move (pushBaseAgain). A push that fails keeps the merge (`pushed: false`); a push that
 * works starts watching the pushed commit's CI.
 */
export async function shipToMain(raw: unknown): Promise<ShipMainResult> {
  const request = parseShipMainRequest(raw)
  if (!request || !isProjectRoot(request.root)) return stepFailure('merge', 'failed', '请求无效')
  if (shipping.has(request.worktree)) return stepFailure('merge', 'blocked', '正在合并这个分支')
  shipping.add(request.worktree)
  const done = { committed: false }
  try {
    const result = await shipSteps(request, done)
    return !result.ok && done.committed ? { ...result, committed: true } : result
  } catch (error) {
    return stepFailure('merge', 'failed', `合并没有成功：${errorText(error)}`, done.committed ? { committed: true } : {})
  } finally {
    shipping.delete(request.worktree)
  }
}

async function shipSteps(request: ShipMainRequest, done: { committed: boolean }): Promise<ShipMainResult> {
  if (request.paths) {
    const committed = await commitWorktree({ root: request.root, worktree: request.worktree, message: request.message, paths: request.paths })
    if (!committed.ok) {
      return stepFailure('commit', committed.reason, committed.message, {
        ...(committed.output ? { output: committed.output } : {}),
        ...(committed.failure ? { failure: committed.failure } : {})
      })
    }
    done.committed = true
  }

  let check = await precheck(request.root, request.worktree)
  if (typeof check === 'string') return stepFailure('merge', 'failed', `没能检查合并：${check}`)
  // The tip the caller checked (the merge sheet's precheck and test) is the one merged, or nothing is.
  if (request.head && check.head && check.head !== request.head) return stepFailure('merge', 'failed', '分支在检查之后又变了：重新检查', { stale: true })
  const root = await realOrSelf(request.root)
  if (check.base && !check.blocker) {
    const caught = await syncBase(root, check)
    if ('message' in caught) return stepFailure('merge', 'blocked', caught.message)
    if (caught.moved) {
      const again = await precheck(request.root, request.worktree)
      if (typeof again === 'string') return stepFailure('merge', 'failed', `没能检查合并：${again}`)
      check = again
    }
  }
  if (check.blocker) return stepFailure('merge', 'blocked', blockerMessage(check.blocker, check.base))
  if (check.conflicts.length > 0) {
    return stepFailure('merge', 'conflicts', `${check.conflicts.length} 个文件和 ${check.base} 冲突`, { conflicts: check.conflicts.map((c) => c.path) })
  }

  // Where the preflight read the base's protection: the base's own upstream remote first (see baseRemoteFor).
  const remote = await baseRemoteFor(root, check.branch, check.base)
  const merged = await mergeWorktree(
    {
      root: request.root,
      worktree: request.worktree,
      method: request.method,
      head: check.head,
      baseHead: check.baseHead,
      push: request.push === true && remote !== null,
      // '' (only without paths): the title and the branch's subjects (its own message without a title).
      ...(request.message ? { message: request.message } : request.title ? { title: request.title } : {})
    },
    { remote }
  )
  if (!merged.ok) return mergeFailure(merged, check, request.method, remote)
  if (merged.push === null || !remote) return { ok: true, commit: merged.commit, pushed: false }
  if (merged.push !== '') return pushFailure(merged.commit, check.base, merged.push, remote)
  await startBaseCi({ root: request.root, worktree: request.worktree, cwd: root, remote, base: check.base, sha: merged.commit, previous: check.baseHead })
  return { ok: true, commit: merged.commit, pushed: true }
}

/**
 * 推送 of the base (the push node): after a local 合并, from the main checkout on its base, or the retry of a push that
 * failed. Pull first — the upstream's commits the local base lacks come in (pullBaseFirst) — then only the base is
 * pushed (running 合并 again would find the branch merged and stop there), and, given `commit`, only while the base
 * still has that merge. A base the remote already has goes through as pushed (git has nothing to send) and its CI is
 * watched, keyed by the worktree that pushed.
 */
export async function pushBaseAgain(raw: unknown): Promise<ShipMainResult> {
  const target = parsePushBaseRequest(raw)
  if (!target || !isProjectRoot(target.root)) return stepFailure('push', 'failed', '请求无效')
  if (shipping.has(target.worktree)) return stepFailure('push', 'blocked', '正在合并这个分支')
  shipping.add(target.worktree)
  try {
    const info = await branchInfo(target)
    if (!info) return stepFailure('push', 'failed', '不是这个项目的 worktree')
    // The main checkout on its base pushes the base itself (base === branch there).
    const { base } = info
    if (!base) return stepFailure('push', 'failed', '不知道这个分支合并进哪个分支')
    const root = await realOrSelf(target.root)
    const baseRef = `refs/heads/${base}`
    const before = (await gitOut(root, ['rev-parse', '--verify', '--quiet', baseRef])).trim()
    if (!before) return stepFailure('push', 'failed', `找不到基线分支 ${base}`)
    const remote = await baseRemoteFor(root, info.branch, base)
    if (!remote) return { ok: true, commit: before, pushed: false }
    if (target.commit && (await git(root, ['merge-base', '--is-ancestor', target.commit, baseRef])).code !== 0) {
      return stepFailure('push', 'failed', `${base} 上已经没有这次的合并（${target.commit.slice(0, 7)}）：没有推送`)
    }
    const pulled = await pullBaseFirst(root, base)
    if (!pulled.ok) {
      if (pulled.reason === 'failed') return stepFailure('push', 'failed', pulled.failure.message, { failure: pulled.failure })
      return stepFailure('push', 'blocked', pulled.message, pulled.reason === 'conflicts' ? { conflicts: pulled.files } : {})
    }
    const head = (await gitOut(root, ['rev-parse', '--verify', '--quiet', baseRef])).trim() || before
    // The merge kept is still the commit pushed unless pulling first rewrote it.
    const commit = target.commit && !pulled.pulled ? target.commit : head
    const remoteRef = `refs/remotes/${remote}/${base}`
    const remoteTip = (await git(root, ['rev-parse', '--verify', '--quiet', remoteRef])).stdout.trim()
    const push = await pushBase(root, base, remote)
    if (push !== '') return pushFailure(commit, base, push, remote)
    // What "was it already failing" compares with: the remote's base before this push, else the commit before it.
    const previous = remoteTip && remoteTip !== head ? remoteTip : (await git(root, ['rev-parse', '--verify', '--quiet', `${head}^`])).stdout.trim()
    await startBaseCi({ root: target.root, worktree: target.worktree, cwd: root, remote, base, sha: head, previous: previous || head })
    return { ok: true, commit, pushed: true }
  } catch (error) {
    return stepFailure('push', 'failed', `推送没有成功：${errorText(error)}`)
  } finally {
    shipping.delete(target.worktree)
  }
}

// ── 同步 / 拉取 / 继续 · 中止 (合入链路 v2) ──────────────────────────────────────────────────────────────────────

/** No editor ever opens (merge messages, the rebase todo list). */
const NO_EDITOR: Readonly<Record<string, string>> = { GIT_EDITOR: 'true', GIT_SEQUENCE_EDITOR: 'true' }

/** What a merge or rebase that may write commits gets: no editor, and the login shell's PATH so hooks find their tools. */
async function commitEnv(): Promise<Record<string, string>> {
  return { ...NO_EDITOR, PATH: await searchPath() }
}

const blockedResult = (message: string): { ok: false; reason: 'blocked'; message: string } => ({ ok: false, reason: 'blocked', message })
const failedResult = (step: GitStep, output: string, context: GitFailureContext): { ok: false; reason: 'failed'; failure: GitFailure } => ({
  ok: false,
  reason: 'failed',
  failure: classifyGitFailure(step, output, context)
})

type Refused = ReturnType<typeof blockedResult> | ReturnType<typeof failedResult>

/** Runs `work` unless the worktree is already merging, syncing or continuing; a throw becomes a classified failure. */
async function exclusive<T>(worktree: string, step: GitStep, work: () => Promise<T>): Promise<T | Refused> {
  if (shipping.has(worktree)) return blockedResult('正在处理这个分支')
  shipping.add(worktree)
  try {
    return await work()
  } catch (error) {
    return failedResult(step, errorText(error), { base: '', remote: null })
  } finally {
    shipping.delete(worktree)
  }
}

/**
 * Fetches only these refspecs, per remote (an unrelated ref the remote moved, or a stale one, cannot block the step);
 * the failure, answered at the fetch step, or null when every fetch went through.
 */
async function fetchOnly(cwd: string, wanted: ReadonlyMap<string, readonly string[]>, base: string): Promise<{ ok: false; reason: 'failed'; failure: GitFailure; step: 'fetch' } | null> {
  for (const [remote, refspecs] of wanted) {
    const ran = await git(cwd, pinned.fetch('--quiet', '--', remote, ...refspecs), { timeout: FETCH_TIMEOUT_MS, env: await pushEnv(cwd) })
    if (ran.code !== 0) return { ...failedResult('fetch', printed(ran), { base, remote }), step: 'fetch' }
  }
  return null
}

/** git's answer to a fetch of a branch the remote does not have. */
const NO_SUCH_REMOTE_REF = /couldn't find remote ref/i

/**
 * 同步 <base>: fetch the base (a failure is returned at the fetch step, nothing else runs) and the branch's own pushed ref
 * (its failure does not count), nothing else → fast-forward the local base when its checkout is clean or nobody has it
 * out (when it cannot, why is returned and the branch syncs with what the preflight counts against: origin/<base> when
 * the local base is only behind it)
 * → nothing to do when the branch has every base commit → merge-tree pre-check (conflicts: the files, nothing started)
 * → tracked uncommitted changes block → a branch never pushed is rebased onto the base, a pushed one merges it. Never
 * pushes. A rebase or merge that stops on conflicts anyway is aborted and answered as conflicts.
 */
export async function syncWorktree(raw: unknown): Promise<ShipSyncResult> {
  const target = parsePrTarget(raw)
  if (!target || !isProjectRoot(target.root)) return blockedResult('请求无效')
  return exclusive<ShipSyncResult>(target.worktree, 'merge', async () => {
    const info = await branchInfo(target)
    if (!info) return blockedResult('不是这个项目的 worktree')
    const { cwd, branch, base } = info
    const operation = await operationOf(cwd)
    if (operation) return blockedResult(CHAIN_TEXT.operation(operation.kind))
    if (!branch) return blockedResult('处于分离 HEAD，没有分支可以同步')
    if (!base || base === branch) return blockedResult('这是基线分支本身，没有可以同步的分支')
    if (!(await refExists(cwd, `refs/heads/${base}`))) return blockedResult(`找不到基线分支 ${base}`)
    const remote = await remoteFor(cwd, branch, base)
    const context = { base, remote }
    // The base is fetched from where it is pushed (see baseRemoteFor) whether or not a remote-tracking ref of it was
    // ever fetched (a remote added later); a remote without the branch is not a failure, the local base is used.
    const [pushed, pushTo] = await Promise.all([pushedTo(cwd, info, remote), baseRemoteFor(cwd, branch, base)])
    let baseRemote: string | null = null
    if (pushTo) {
      const fetchFailed = await fetchOnly(cwd, new Map([[pushTo, [`+refs/heads/${base}:refs/remotes/${pushTo}/${base}`]]]), base)
      if (fetchFailed && !NO_SUCH_REMOTE_REF.test(fetchFailed.failure.tail)) return fetchFailed
      if (!fetchFailed) baseRemote = pushTo
    }
    // The branch's own ref only refreshes what the preflight counts: a remote branch deleted after its PR merged (an
    // upstream config stays behind) must not stop 同步, so its fetch failing is not one.
    if (pushed) await fetchOnly(cwd, new Map([[pushed.remote, [pushedRefspec(pushed)]]]), base)

    let note: { baseNotCaughtUp?: string } = {}
    if (baseRemote) {
      const caught = await catchUpBase(cwd, baseRemote, base, { fetched: true })
      if (!caught.ok) note = { baseNotCaughtUp: caught.message }
    }

    // What the preflight counts against (origin/<base> when the local base could not catch up and is only behind it):
    // the base 同步 brings in, so the chain never offers a 同步 that changes nothing.
    const baseRef = await baseCompareRef(cwd, base, branch)
    // The ref the step and a conflict hand-off name: what runs, not the local base when that is another ref.
    const onto = { onto: baseRef.replace(/^refs\/(?:heads|remotes)\//, ''), ontoRef: baseRef }
    if ((await countCommits(cwd, `refs/heads/${branch}..${baseRef}`)) === 0) return { ok: true, ...note, ...onto }
    // Pushed (an upstream, even one git keeps no remote-tracking ref of): never rewritten, the base is merged in.
    const mode = pushed ? 'merge' : 'rebase'

    let conflicts: MergeConflict[] | null = null
    try {
      conflicts = (await mergeTreeConflicts(cwd, baseRef, `refs/heads/${branch}`)).conflicts
    } catch {
      // git < 2.38 has no merge-tree --write-tree: run it and abort on conflicts.
    }
    if (conflicts && conflicts.length > 0) return { ok: false, reason: 'conflicts', files: conflicts.map((c) => c.path), mode, conflicts, ...note, ...onto }

    const status = await git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=no', '--ignore-submodules=dirty'])
    if (status.code !== 0) return failedResult(mode, printed(status), context)
    if (trackedDirtyPaths(status.stdout).length > 0) return blockedResult(CHAIN_TEXT.commitFirst)

    // The full ref (a tag of the same name never wins), with the message git would write for the short name. The user's
    // merge / rebase config does not change what runs (a merge.ff=only would refuse the merge commit 同步 is for).
    const merged = baseRef.startsWith('refs/remotes/') ? `remote-tracking branch '${baseRef.slice('refs/remotes/'.length)}'` : `branch '${base}'`
    const args =
      mode === 'rebase'
        ? pinned.rebase('--quiet', baseRef)
        : pinned.merge('--ff', '--no-edit', '--quiet', `--message=Merge ${merged} into ${branch}`, baseRef)
    const ran = await git(cwd, args, { timeout: CHECKOUT_TIMEOUT_MS, env: await commitEnv() })
    if (ran.code === 0) return { ok: true, ...note, ...onto }
    const files = await unresolvedPaths(cwd)
    const stopped = await operationOf(cwd)
    if (stopped) {
      const aborted = await git(cwd, [stopped.kind, '--abort'], { timeout: CHECKOUT_TIMEOUT_MS, env: NO_EDITOR })
      if (aborted.code !== 0) console.error(`[ship] could not abort the ${stopped.kind} 同步 started in ${cwd}:`, lastLines(printed(aborted)))
    }
    if (files.length > 0) return { ok: false, reason: 'conflicts', files, mode, conflicts: [], ...note, ...onto }
    return failedResult(mode, printed(ran), context)
  })
}

/** What fast-forwarding a pushed branch to its remote branch did: the remote branch is gone (deleted after its PR
 *  merged), a step failed, or `commits` came in (0: the remote had nothing new); `remoteTip`: the remote branch's commit. */
type BranchPull = { kind: 'gone' } | { kind: 'failed'; failure: GitFailure; step: 'fetch' | 'pull' } | { kind: 'done'; commits: number; remoteTip: string }

/** Fetches the branch it was pushed to (only that ref), then fast-forwards to it — its remote-tracking ref, or
 *  FETCH_HEAD when git keeps none; a diverged branch fails as such. */
async function fastForwardPushed(cwd: string, branch: string, pushed: PushedTo, context: GitFailureContext): Promise<BranchPull> {
  const fetched = await git(cwd, pinned.fetch('--quiet', '--', pushed.remote, pushedRefspec(pushed)), { timeout: FETCH_TIMEOUT_MS, env: await pushEnv(cwd) })
  if (fetched.code !== 0 && NO_SUCH_REMOTE_REF.test(printed(fetched))) return { kind: 'gone' }
  if (fetched.code !== 0) return { kind: 'failed', failure: classifyGitFailure('fetch', printed(fetched), context), step: 'fetch' }
  const tip = (await gitOut(cwd, ['rev-parse', '--verify', '--quiet', `${pushed.tracking ?? 'FETCH_HEAD'}^{commit}`])).trim()
  if (!tip) return { kind: 'failed', failure: classifyGitFailure('fetch', `没能读到 ${pushed.remote} 上的 ${pushed.remoteRef.slice('refs/heads/'.length)}`, context), step: 'fetch' }
  const behind = (await countCommits(cwd, `refs/heads/${branch}..${tip}`)) ?? 0
  if (behind === 0) return { kind: 'done', commits: 0, remoteTip: tip }
  const ran = await git(cwd, pinned.merge('--ff-only', '--quiet', tip), { timeout: CHECKOUT_TIMEOUT_MS, env: NO_EDITOR })
  return ran.code === 0 ? { kind: 'done', commits: behind, remoteTip: tip } : { kind: 'failed', failure: classifyGitFailure('pull', printed(ran), context), step: 'pull' }
}

/**
 * 拉取: fetch the branch it was pushed to (only that ref), then fast-forward to it — its remote-tracking ref, or
 * FETCH_HEAD when git keeps none; a diverged branch fails as such.
 */
export async function pullWorktree(raw: unknown): Promise<ShipPullResult> {
  const target = parsePrTarget(raw)
  if (!target || !isProjectRoot(target.root)) return blockedResult('请求无效')
  return exclusive<ShipPullResult>(target.worktree, 'pull', async () => {
    const info = await branchInfo(target)
    if (!info) return blockedResult('不是这个项目的 worktree')
    const { cwd, branch, base } = info
    const operation = await operationOf(cwd)
    if (operation) return blockedResult(CHAIN_TEXT.operation(operation.kind))
    if (!branch) return blockedResult('处于分离 HEAD，没有分支可以拉取')
    const remote = await remoteFor(cwd, branch, base)
    if (!remote) return blockedResult(CHAIN_TEXT.noRemotePull)
    const pushed = await pushedTo(cwd, info, remote)
    if (!pushed) return blockedResult(CHAIN_TEXT.neverPushed)
    const pulled = await fastForwardPushed(cwd, branch, pushed, { base: base ?? branch, remote: pushed.remote })
    // The remote branch was deleted (its PR merged) while the upstream config stays: nothing to pull, not a failure.
    if (pulled.kind === 'gone') return blockedResult(`${pushed.remote} 上已经没有分支 ${pushed.remoteRef.slice('refs/heads/'.length)}`)
    return pulled.kind === 'failed' ? { ok: false, reason: 'failed', failure: pulled.failure } : { ok: true }
  })
}

// ── the push node: pull first (and what the push sends) ─────────────────────────────────────────────────────────

/** What pulling first did; a failure as ShipPrepushResult says it. */
type PullFirst = { ok: true; pulled: { from: string; commits: number } | null } | Extract<ShipPrepushResult, { ok: false }>

/** The checkout (its real path) that has `branch` out, or null when none has. */
async function checkoutOf(root: string, branch: string): Promise<string | null> {
  const entries = parseWorktreePorcelain(await gitOut(root, ['worktree', 'list', '--porcelain']))
  const entry = entries.find((e) => !e.bare && e.branch === branch)
  return entry ? realOrSelf(entry.path) : null
}

/**
 * The base's pull first: fetch its upstream (only that ref; a failed fetch leaves what was known); when the upstream has commits the local base lacks, bring
 * them in. Nothing unpushed: a fast-forward (in the checkout that has the base out, else the ref). Unpushed commits: a
 * rebase of those onto the upstream, never a force-push, never a dropped commit — in the checkout that has the base out
 * (refused while tracked files there are uncommitted; on conflicts the rebase is left stopped there to resolve), else
 * away from every working tree the user sees (rebaseAway). A base without an upstream has nothing to pull.
 */
async function pullBaseFirst(root: string, base: string): Promise<PullFirst> {
  const up = await baseUpstream(root, base)
  if (!up) return { ok: true, pulled: null }
  const from = remoteName(up)
  const context = { base, remote: up.remote }
  // A failed fetch leaves what was last fetched (the push says it when the remote moved meanwhile), as 合并's catch-up.
  await git(root, pinned.fetch('--quiet', '--', up.remote, `+${up.remoteRef}:${up.ref}`), { timeout: FETCH_TIMEOUT_MS, env: await pushEnv(root) })
  const baseRef = `refs/heads/${base}`
  const counts = await aheadBehind(root, up.ref, baseRef)
  if (!counts || counts.behind === 0) return { ok: true, pulled: null }
  const pulled = { ok: true as const, pulled: { from, commits: counts.behind } }
  const checkout = await checkoutOf(root, base)
  if (checkout) {
    const busy = await operationOf(checkout)
    if (busy) return { ok: false, reason: 'blocked', message: `${base} 的工作区里有进行中的${operationNames[busy.kind]}：先完成或放弃它`, from }
  }
  if (counts.ahead === 0) {
    const old = (await gitOut(root, ['rev-parse', '--verify', '--quiet', baseRef])).trim()
    const ran = checkout
      ? await git(checkout, pinned.merge('--ff-only', '--quiet', '--no-edit', up.ref), { timeout: CHECKOUT_TIMEOUT_MS, env: NO_EDITOR })
      : await git(root, ['update-ref', '-m', `wavi: fast-forward ${base}`, baseRef, up.ref, old])
    return ran.code === 0 ? pulled : { ok: false, reason: 'blocked', message: `${base} 落后 ${from} ${counts.behind} 个提交，没法快进：${lastLines(printed(ran))}`, from }
  }
  if (!checkout) return rebaseAway(root, base, up.ref, from, pulled)
  const status = await git(checkout, ['status', '--porcelain=v1', '-z', '--untracked-files=no', '--ignore-submodules=dirty'])
  if (status.code !== 0) return { ok: false, reason: 'failed', failure: classifyGitFailure('rebase', printed(status), context), from }
  if (trackedDirtyPaths(status.stdout).length > 0) {
    return { ok: false, reason: 'blocked', message: `${base} 落后 ${from} ${counts.behind} 个提交，要先把 ${base} 的提交变基上去，但 ${base} 的工作区有未提交的改动：先提交或放弃它们`, from }
  }
  const ran = await git(checkout, pinned.rebase('--quiet', up.ref), { timeout: CHECKOUT_TIMEOUT_MS, env: await commitEnv() })
  if (ran.code === 0) return pulled
  const stopped = await operationOf(checkout)
  if (stopped && stopped.unresolved.length > 0) {
    return { ok: false, reason: 'conflicts', files: stopped.unresolved, from, checkout, message: `把 ${base} 的提交变基到 ${from} 时停在了冲突上：${stopped.unresolved.length} 个文件` }
  }
  if (stopped) {
    const aborted = await git(checkout, [stopped.kind, '--abort'], { timeout: CHECKOUT_TIMEOUT_MS, env: NO_EDITOR })
    if (aborted.code !== 0) console.error(`[ship] could not abort the ${stopped.kind} of ${base} started in ${checkout}:`, lastLines(printed(aborted)))
  }
  return { ok: false, reason: 'failed', failure: classifyGitFailure('rebase', printed(ran), context), from }
}

/**
 * Rebases the base's unpushed commits onto its upstream where nobody has the base out: in a detached worktree of its
 * own under the system's temp folder, then moves the base only if it is still where it was (`update-ref` with the old
 * value), then removes that worktree. On conflicts the rebase is aborted and the base is left as it was.
 */
async function rebaseAway(root: string, base: string, onto: string, from: string, pulled: PullFirst & { ok: true }): Promise<PullFirst> {
  const baseRef = `refs/heads/${base}`
  const old = (await gitOut(root, ['rev-parse', '--verify', '--quiet', baseRef])).trim()
  if (!old) return { ok: false, reason: 'blocked', message: `找不到基线分支 ${base}`, from }
  const dir = await mkdtemp(join(tmpdir(), 'wavi-base-rebase-'))
  const tree = join(dir, 'tree')
  let added = false
  try {
    const add = await git(root, ['worktree', 'add', '--detach', '--quiet', tree, old], { timeout: CHECKOUT_TIMEOUT_MS })
    if (add.code !== 0) return { ok: false, reason: 'failed', failure: classifyGitFailure('rebase', printed(add), { base, remote: null }), from }
    added = true
    const ran = await git(tree, pinned.rebase('--quiet', onto), { timeout: CHECKOUT_TIMEOUT_MS, env: await commitEnv() })
    if (ran.code !== 0) {
      const files = await unresolvedPaths(tree)
      await git(tree, ['rebase', '--abort'], { timeout: CHECKOUT_TIMEOUT_MS, env: NO_EDITOR })
      const named = files.length > 0 ? `（${files.slice(0, 3).join('、')}${files.length > 3 ? ` 等 ${files.length} 个文件` : ''}）` : `：${lastLines(printed(ran))}`
      return { ok: false, reason: 'blocked', message: `把 ${base} 的提交变基到 ${from} 时冲突${named}，已放弃，${base} 没有变化`, from }
    }
    const tip = (await gitOut(tree, ['rev-parse', '--verify', '--quiet', 'HEAD'])).trim()
    const moved = tip ? await git(root, ['update-ref', '-m', `wavi: rebase ${base} onto ${from}`, baseRef, tip, old]) : null
    if (!moved || moved.code !== 0) return { ok: false, reason: 'blocked', message: `${base} 在变基时又变了：再试一次`, from }
    return pulled
  } finally {
    if (added) {
      const removed = await git(root, ['worktree', 'remove', '--force', tree], { timeout: CHECKOUT_TIMEOUT_MS })
      if (removed.code !== 0) console.error('[ship] could not remove the temporary worktree of a base rebase:', lastLines(printed(removed)))
    }
    await rm(dir, { recursive: true, force: true }).catch(() => {})
    if (added) await git(root, ['worktree', 'prune'])
  }
}

/** Two refs as full commit ids, the push's range; null when either is missing or they are the same commit. */
async function rangeOf(cwd: string, from: string, to: string): Promise<{ range: CommitRange; commits: number } | null> {
  const [a, b] = await Promise.all([from, to].map((ref) => gitOut(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).then((out) => out.trim())))
  if (!a || !b || a === b) return null
  const commits = (await countCommits(cwd, `${a}..${b}`)) ?? 0
  return commits > 0 ? { range: { from: a, to: b }, commits } : null
}

/**
 * The push node's first step (ShipApi.prepush): pull first, then say what the push will send that the remote lacks —
 * the pre-push review's range. `base`: the local base against its upstream (pullBaseFirst); `branch`: the branch against
 * its remote branch, fast-forwarded first (a pushed branch is never rebased; diverged fails as such and the agent takes
 * it); `new-pr`: the branch as a PR proposes it, `<base>...<branch>`. Never pushes.
 */
export async function shipPrepush(raw: unknown): Promise<ShipPrepushResult> {
  const request = parsePrepushRequest(raw)
  if (!request || !isProjectRoot(request.root)) return blockedResult('请求无效')
  return exclusive<ShipPrepushResult>(request.worktree, 'pull', async () => {
    const info = await branchInfo(request)
    if (!info) return blockedResult('不是这个项目的 worktree')
    const { cwd, branch, base } = info
    const operation = await operationOf(cwd)
    if (operation) return blockedResult(CHAIN_TEXT.operation(operation.kind))
    if (!branch) return blockedResult('处于分离 HEAD，没有分支可以推送')
    if (!base) return blockedResult('不知道这个分支合并进哪个分支')
    const root = await realOrSelf(request.root)
    const nothing = { range: null, commits: 0 }
    if (request.push === 'base') {
      if (!(await refExists(root, `refs/heads/${base}`))) return blockedResult(`找不到基线分支 ${base}`)
      const pulled = await pullBaseFirst(root, base)
      if (!pulled.ok) return pulled
      // Against the upstream as just fetched, else the base on the remote it is pushed to.
      const up = await baseUpstream(root, base)
      const remote = up ? null : await baseRemoteFor(root, branch, base)
      const against = up?.ref ?? (remote && (await refExists(root, `refs/remotes/${remote}/${base}`)) ? `refs/remotes/${remote}/${base}` : null)
      const sent = against ? await rangeOf(root, against, `refs/heads/${base}`) : null
      return { ok: true, pulled: pulled.pulled, ...(sent ?? nothing) }
    }
    if (base === branch) return blockedResult('这是基线分支本身，没有可以推送的分支')
    const remote = await remoteFor(cwd, branch, base)
    const pushed = remote ? await pushedTo(cwd, info, remote) : null
    let pulled: { from: string; commits: number } | null = null
    let remoteTip: string | null = null
    if (pushed) {
      const from = `${pushed.remote}/${pushed.remoteRef.slice('refs/heads/'.length)}`
      const done = await fastForwardPushed(cwd, branch, pushed, { base, remote: pushed.remote })
      // A fetch that failed leaves what was last fetched (the push says it when the remote moved meanwhile).
      if (done.kind === 'failed' && done.step === 'pull') return { ok: false, reason: 'failed', failure: done.failure, from }
      if (done.kind === 'done') {
        remoteTip = done.remoteTip
        if (done.commits > 0) pulled = { from, commits: done.commits }
      }
    }
    // 创建 PR proposes everything since the base (as gh pr create compares); a branch never pushed sends the same.
    let against = remoteTip
    if (request.push === 'new-pr' || !against) {
      against = remote && (await refExists(cwd, `refs/remotes/${remote}/${base}`)) ? `refs/remotes/${remote}/${base}` : `refs/heads/${base}`
      const mergeBase = (await gitOut(cwd, ['merge-base', against, `refs/heads/${branch}`])).trim()
      against = mergeBase || against
    }
    const sent = await rangeOf(cwd, against, `refs/heads/${branch}`)
    return { ok: true, pulled, ...(sent ?? nothing) }
  })
}

/**
 * Tracked files a 中止 would lose. A rebase abort is `reset --hard`: everything changed since the stop goes. A merge or
 * cherry-pick abort is `reset --merge`: what is staged and the conflicted files go, an edit that is not staged in a file
 * the operation did not touch stays.
 *
 * Against AUTO_MERGE (git ≥ 2.42: the tree git wrote when it stopped, conflict markers included), so what git itself
 * staged does not count: staged changes besides the unresolved files (whose index entries always differ), a conflicted
 * file edited since (not staged yet), and for a rebase any other edit. Without AUTO_MERGE nothing tells git's own work
 * from the user's, so every staged change besides the unresolved files counts (for a rebase every edit too); an edited
 * conflicted file cannot be told from its markers there.
 */
async function lostOnAbort(cwd: string, operation: ShipOperation): Promise<string[]> {
  const names = (out: string): string[] => out.split('\0').filter(Boolean)
  const resets = operation.kind === 'rebase'
  const unresolved = new Set(operation.unresolved)
  const hasAutoMerge = (await git(cwd, ['rev-parse', '--verify', '--quiet', 'AUTO_MERGE^{tree}'])).code === 0
  const stopped = hasAutoMerge ? 'AUTO_MERGE' : 'HEAD'
  const literal = [...unresolved].map((path) => `:(literal)${path}`)
  const [staged, edited, editedConflicts] = await Promise.all([
    gitOut(cwd, ['diff', '--name-only', '-z', '--cached', stopped, '--']).then(names),
    resets ? gitOut(cwd, ['diff', '--name-only', '-z', stopped, '--']).then(names) : Promise.resolve([]),
    hasAutoMerge && literal.length > 0 ? gitOut(cwd, ['diff', '--name-only', '-z', 'AUTO_MERGE', '--', ...literal]).then(names) : Promise.resolve([])
  ])
  const besides = [...staged, ...edited].filter((path) => !unresolved.has(path))
  return [...new Set([...besides, ...editedConflicts])].sort()
}

/**
 * 继续 / 中止 the merge, rebase or cherry-pick stopped in the worktree. 继续 with unresolved files answers them; 中止 that
 * would lose resolutions or other changes asks first (`confirm`, then the request again with `force`).
 */
export async function shipOperation(raw: unknown): Promise<ShipOperationResult> {
  const request = parseShipOperationRequest(raw)
  if (!request || !isProjectRoot(request.root)) return blockedResult('请求无效')
  return exclusive<ShipOperationResult>(request.worktree, 'merge', async () => {
    const info = await branchInfo(request)
    if (!info) return blockedResult('不是这个项目的 worktree')
    const { cwd } = info
    const operation = await operationOf(cwd)
    if (!operation) return blockedResult('没有进行中的合并、rebase 或 cherry-pick')
    const step: GitStep = operation.kind === 'rebase' ? 'rebase' : 'merge'
    const context = { base: info.base ?? '基线', remote: null }
    if (request.action === 'abort') {
      // An abort resets the worktree: resolutions (and, for a rebase, other edits) made since it stopped go too.
      // Forced after a yes: asked again when it would now lose a file the user was not shown (edited while the
      // confirmation was open). A renderer that sends no list is not compared.
      if (request.force !== true || request.confirmed) {
        const files = await lostOnAbort(cwd, operation)
        const shown = new Set(request.confirmed ?? [])
        if (request.force === true ? files.some((path) => !shown.has(path)) : files.length > 0) return { ok: false, reason: 'confirm', files }
      }
      const ran = await git(cwd, [operation.kind, '--abort'], { timeout: CHECKOUT_TIMEOUT_MS, env: NO_EDITOR })
      return ran.code === 0 ? { ok: true } : failedResult(step, printed(ran), context)
    }
    if (operation.unresolved.length > 0) return { ok: false, reason: 'conflicts', files: operation.unresolved }
    const ran = await git(cwd, [operation.kind, '--continue'], { timeout: CHECKOUT_TIMEOUT_MS, env: await commitEnv() })
    if (ran.code === 0) return { ok: true }
    // A rebase stops again on the next commit's conflicts.
    const again = await operationOf(cwd)
    if (again && again.unresolved.length > 0) return { ok: false, reason: 'conflicts', files: again.unresolved }
    return failedResult(step, printed(ran), context)
  })
}

// ── CI of the pushed base commit ────────────────────────────────────────────────────────────────────────────────

interface Watch {
  root: string
  worktree: string
  base: string
  /** The pushed commit. */
  sha: string
  /** The base's tip before this push: what "was it already failing?" asks about. */
  previous: string
  repo: GitHubRepo
  startedAt: number
  lastPoll: number
  /** Errors in a row. */
  failures: number
  answered: boolean
  timer: ReturnType<typeof setTimeout> | null
  inFlight: Promise<void> | null
  ci: BaseCi | null
}

const watches = new Map<string, Watch>()

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const upper = (value: unknown): string => String(value ?? '').toUpperCase()

/**
 * `commits/{sha}/check-runs` and `commits/{sha}/status` (REST) as the rollup entries `summarizeChecks` reads: a
 * check run keeps its status and conclusion, a legacy status its state. Stale runs are skipped. Only the statuses
 * list counts: the combined state of a commit without statuses reads "pending".
 */
export function commitRollup(checkRuns: unknown, status: unknown): unknown[] {
  const rollup: unknown[] = []
  if (isRecord(checkRuns) && Array.isArray(checkRuns.check_runs)) {
    for (const run of checkRuns.check_runs.slice(0, 300)) {
      if (!isRecord(run) || upper(run.conclusion) === 'STALE') continue
      rollup.push({ __typename: 'CheckRun', name: run.name, status: upper(run.status), conclusion: upper(run.conclusion), detailsUrl: run.details_url ?? run.html_url })
    }
  }
  if (isRecord(status) && Array.isArray(status.statuses)) {
    for (const item of status.statuses.slice(0, 200)) {
      if (!isRecord(item)) continue
      rollup.push({ __typename: 'StatusContext', context: item.context, state: upper(item.state), targetUrl: item.target_url })
    }
  }
  return rollup
}

async function ghGet(repo: GitHubRepo, path: string): Promise<{ json: unknown } | { error: string }> {
  const ran = await gh(['api', `repos/${repo.owner}/${repo.name}/${path}`, `--hostname=${repo.host}`], { timeout: 30_000 })
  if (ran.code !== 0) {
    const error = lastLines(ran.stderr || ran.stdout) || `gh exited with ${ran.code}`
    if (isRateLimited(error)) pauseGhForRateLimit()
    if (isSignedOut(error)) void detectGh(true)
    return { error }
  }
  try {
    return { json: JSON.parse(ran.stdout) as unknown }
  } catch {
    return { error: 'gh printed no JSON' }
  }
}

/** The checks of one commit (check runs and legacy statuses), or why gh could not tell. */
async function commitChecks(repo: GitHubRepo, sha: string): Promise<{ checks: ChecksSummary } | { error: string }> {
  if (!isSha(sha)) return { error: 'not a commit id' }
  const [runs, status] = await Promise.all([ghGet(repo, `commits/${sha}/check-runs?per_page=100`), ghGet(repo, `commits/${sha}/status?per_page=100`)])
  if ('error' in runs) return runs
  if ('error' in status) return status
  return { checks: summarizeChecks(commitRollup(runs.json, status.json)) }
}

function emitBaseCi(ci: BaseCi): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(SHIP_IPC.baseCiChanged, ci)
  }
}

const stopped = (checks: ChecksSummary): boolean => checks.state === 'passing' || checks.state === 'failing'

function scheduleCi(watch: Watch): void {
  if (watch.timer) clearTimeout(watch.timer)
  watch.timer = null
  if (watches.get(watch.worktree) !== watch) return
  const settled = watch.ci && (stopped(watch.ci.checks) || (watch.ci.checks.state === 'none' && Date.now() - watch.startedAt >= CI_NO_CHECKS_GRACE_MS))
  if (settled || Date.now() - watch.startedAt > CI_WATCH_MAX_MS) return
  if (!watch.answered && watch.failures >= CI_GIVE_UP_FAILURES) return
  const delay = Math.max(watch.failures > 0 ? nextPollDelay({ pr: null, focused: true, failures: watch.failures }) : CI_POLL_MS, ghPausedUntil() - Date.now())
  watch.timer = setTimeout(() => {
    watch.timer = null
    void pollCi(watch)
  }, delay)
  watch.timer.unref?.()
}

async function pollOnce(watch: Watch): Promise<void> {
  if (watches.get(watch.worktree) !== watch) return
  if ((await detectGh()) !== 'ready' || Date.now() < ghPausedUntil()) return
  const found = await commitChecks(watch.repo, watch.sha)
  if ('error' in found) {
    watch.failures++
    return
  }
  watch.failures = 0
  watch.answered = true
  let checks = found.checks
  if (checks.state === 'none' && Date.now() - watch.startedAt < CI_NO_CHECKS_GRACE_MS) checks = { ...checks, state: 'pending' }
  const previous = watch.ci
  const ci: BaseCi = {
    worktree: watch.worktree,
    base: watch.base,
    sha: watch.sha,
    checks,
    url: `https://${watch.repo.host}/${watch.repo.owner}/${watch.repo.name}/commit/${watch.sha}/checks`,
    checkedAt: Date.now()
  }
  watch.ci = ci
  if (!previous || JSON.stringify(previous.checks) !== JSON.stringify(checks)) emitBaseCi(ci)
}

/** Asks GitHub about the watched commit now (one ask at a time per watch) and plans the next. */
function pollCi(watch: Watch): Promise<void> {
  if (watch.inFlight) return watch.inFlight
  if (watch.timer) {
    clearTimeout(watch.timer)
    watch.timer = null
  }
  watch.inFlight = pollOnce(watch)
    .catch(() => {
      watch.failures++
    })
    .finally(() => {
      watch.inFlight = null
      watch.lastPoll = Date.now()
      scheduleCi(watch)
    })
  return watch.inFlight
}

/** Starts (or restarts) watching the CI of `sha`, which Wavi just pushed to the base on `remote`. Nothing for a
 *  non-GitHub remote. */
async function startBaseCi(input: { root: string; worktree: string; cwd: string; remote: string; base: string; sha: string; previous: string }): Promise<void> {
  const old = watches.get(input.worktree)
  if (old?.timer) clearTimeout(old.timer)
  watches.delete(input.worktree)
  const repo = await gitHubRepoFromUrl(await gitOut(input.cwd, ['remote', 'get-url', '--', input.remote]))
  if (!repo) return
  const { cwd: _cwd, remote: _remote, ...rest } = input
  const watch: Watch = { ...rest, repo, startedAt: Date.now(), lastPoll: 0, failures: 0, answered: false, timer: null, inFlight: null, ci: null }
  watches.set(input.worktree, watch)
  // The first answer comes soon; GitHub needs a moment to register the push's checks.
  watch.timer = setTimeout(() => {
    watch.timer = null
    void pollCi(watch)
  }, 3_000)
  watch.timer.unref?.()
}

function watchFor(raw: unknown): Watch | null {
  const target = parsePrTarget(raw)
  if (!target || !isProjectRoot(target.root)) return null
  const watch = watches.get(target.worktree)
  return watch && watch.root === target.root ? watch : null
}

/** Asks about the watched commit now, unless it was asked a moment ago. */
export async function checkBaseCi(worktree: string, force = false): Promise<BaseCi | null> {
  const watch = watches.get(worktree)
  if (!watch) return null
  if (watch.inFlight) await watch.inFlight
  else if (force || Date.now() - watch.lastPoll >= CI_REFRESH_MIN_MS) await pollCi(watch)
  return watch.ci
}

export function baseCi(raw: unknown): BaseCi | null {
  return watchFor(raw)?.ci ?? null
}

/** The failing checks of the pushed commit (asked fresh) and the end of their logs. */
export async function baseFailure(raw: unknown): Promise<BaseCiFailure | null> {
  const watch = watchFor(raw)
  if (!watch) return null
  const ci = await checkBaseCi(watch.worktree)
  if (!ci || ci.checks.state !== 'failing') return null
  return { base: watch.base, sha: watch.sha, checks: ci.checks.failing.map((check) => check.name), log: await failedLogs(watch.repo, ci.checks.failing) }
}

/**
 * Check names failing on the base without this worktree's push: after Wavi pushed, on the base's tip before it (so
 * "already red" can be told from "this push broke it"), otherwise on the tip of the base's upstream as last fetched.
 * null when unknown (no gh, not GitHub, any error).
 */
export async function baseFailing(raw: unknown): Promise<string[] | null> {
  const target = parsePrTarget(raw)
  if (!target || !isProjectRoot(target.root)) return null
  try {
    let repo: GitHubRepo | null
    let sha: string
    const watch = watchFor(target)
    if (watch) {
      repo = watch.repo
      sha = watch.previous
    } else {
      const info = await branchInfo(target)
      if (!info?.base) return null
      const remote = await baseRemoteFor(info.cwd, info.branch, info.base)
      if (!remote) return null
      repo = await gitHubRepoFromUrl(await gitOut(info.cwd, ['remote', 'get-url', '--', remote]))
      sha = (await gitOut(info.cwd, ['rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/${info.base}`])).trim()
    }
    if (!repo || !isSha(sha)) return null
    if ((await detectGh()) !== 'ready' || Date.now() < ghPausedUntil()) return null
    const found = await commitChecks(repo, sha)
    return 'checks' in found ? found.checks.failing.map((check) => check.name) : null
  } catch {
    return null
  }
}

/** Forgets every watch and cached answer (tests). */
export function resetShip(): void {
  for (const watch of watches.values()) if (watch.timer) clearTimeout(watch.timer)
  watches.clear()
  protection.clear()
  mergeSettings.clear()
}

// ── diffs ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** stdout of a git command, at most `cap` characters (the rest is dropped and the process stopped); null on failure. */
async function gitCapped(cwd: string, args: string[], cap: number): Promise<string | null> {
  return (await gitCappedWithCut(cwd, args, cap))?.text ?? null
}

/** gitCapped's text and whether it was cut at `cap`; null on failure. */
function gitCappedWithCut(cwd: string, args: string[], cap: number): Promise<DiffSinceAnswer | null> {
  return new Promise((resolve) => {
    let text = ''
    let capped = false
    let settled = false
    const decoder = new StringDecoder('utf8')
    const child = spawn('git', args, { cwd, env: gitEnv(NO_OPTIONAL_LOCKS), stdio: ['ignore', 'pipe', 'ignore'] })
    const finish = (value: DiffSinceAnswer | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      finish(null)
    }, 60_000)
    child.stdout.on('data', (chunk: Buffer) => {
      if (capped) return
      text += decoder.write(chunk)
      if (text.length > cap) {
        capped = true
        child.kill('SIGTERM')
      }
    })
    child.once('error', () => finish(null))
    child.once('close', (code) => {
      if (capped) {
        // Whole lines only.
        const cut = text.slice(0, cap)
        finish({ text: cut.slice(0, cut.lastIndexOf('\n') + 1) || cut, cut: true })
      } else finish(code === 0 ? { text: text + decoder.end(), cut: false } : null)
    })
  })
}

/** `since` resolved to a full commit id, when it is a commit that HEAD has as an ancestor (or is). */
async function ancestorOfHead(cwd: string, since: string): Promise<string | null> {
  const resolved = (await gitOut(cwd, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${since}^{commit}`])).trim()
  if (!isSha(resolved) || !resolved.startsWith(since)) return null
  return (await git(cwd, ['merge-base', '--is-ancestor', resolved, 'HEAD'])).code === 0 ? resolved : null
}

async function sinceTarget(raw: unknown): Promise<{ cwd: string; request: DiffSinceRequest; sha: string; branch: string | null; base: string | null } | string> {
  const request = parseDiffSinceRequest(raw)
  if (!request || !isProjectRoot(request.root)) return '请求无效'
  const info = await branchInfo(request)
  if (!info) return '不是这个项目的 worktree'
  const sha = await ancestorOfHead(info.cwd, request.since)
  if (!sha) return `${request.since} 不是这个分支上的提交`
  return { cwd: info.cwd, request, sha, branch: info.branch, base: info.base }
}

/** The branch's diff from `since` to HEAD (what a fix the agent committed changed), at most 2 MB. */
export async function diffSince(raw: unknown): Promise<string | null> {
  return (await diffSinceWithCut(raw))?.text ?? null
}

/** diffSince, saying whether the diff was cut at the cap. */
export async function diffSinceWithCut(raw: unknown): Promise<DiffSinceAnswer | null> {
  const found = await sinceTarget(raw)
  if (typeof found === 'string') return null
  return gitCappedWithCut(found.cwd, ['-c', 'core.quotePath=false', 'diff', '--no-color', '--no-ext-diff', found.sha, 'HEAD', '--'], DIFF_SINCE_CAP)
}

const discarding = new Set<string>()

/** 丢弃: moves the worktree's branch back to `since`. Refuses with uncommitted changes to tracked files. */
export async function discardSince(raw: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
  const found = await sinceTarget(raw)
  if (typeof found === 'string') return failure(found)
  const { cwd, request, sha, branch, base } = found
  if (!branch) return failure('处于分离 HEAD，没有分支可以回退')
  if (!base || base === branch) return failure('这是基线分支本身：Wavi 不回退基线分支')
  if (shipping.has(request.worktree) || discarding.has(request.worktree)) return failure('正在合并或回退这个分支')
  discarding.add(request.worktree)
  try {
    // Untracked files stay where they are under `reset --hard`; changes to tracked files would be lost.
    const status = await git(cwd, ['status', '--porcelain=v1', '--untracked-files=no', '--ignore-submodules=dirty'])
    if (status.code !== 0) return failure(`没能检查改动：${lastLines(status.stderr || status.stdout)}`)
    if (status.stdout.trim() !== '') return failure('有没提交的改动：先提交或放弃它们，再丢弃')
    const reset = await git(cwd, ['reset', '--hard', '--quiet', sha], { timeout: CHECKOUT_TIMEOUT_MS })
    if (reset.code !== 0) return failure(`没能回退：${lastLines(reset.stderr || reset.stdout)}`)
    return { ok: true }
  } finally {
    discarding.delete(request.worktree)
  }
}

/** Risk markers of the worktree's whole change against its base, working tree included (untracked files are skipped). */
export async function shipRisks(raw: unknown): Promise<RiskMarker[]> {
  const target = parsePrTarget(raw)
  if (!target || !isProjectRoot(target.root)) return []
  try {
    const info = await branchInfo(target)
    if (!info?.branch || !info.base || info.base === info.branch) return []
    const mergeBase = (await gitOut(info.cwd, ['merge-base', `refs/heads/${info.base}`, 'HEAD'])).trim()
    if (!isSha(mergeBase)) return []
    const diff = await gitCapped(info.cwd, ['-c', 'core.quotePath=false', 'diff', '--no-color', '--no-ext-diff', mergeBase, '--'], RISK_DIFF_CAP)
    return diff ? riskMarkers(diff) : []
  } catch {
    return []
  }
}

// ── IPC ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export function registerShipHandlers(): void {
  ipcMain.handle(SHIP_IPC.preflight, (_event, raw: unknown) => shipPreflight(raw))
  ipcMain.handle(SHIP_IPC.handoff, (_event, raw: unknown) => handoffSlot(raw))
  ipcMain.handle(SHIP_IPC.readHandoff, (_event, raw: unknown) => readHandoffText(raw))
  ipcMain.handle(SHIP_IPC.shipToMain, (_event, raw: unknown) => shipToMain(raw))
  ipcMain.handle(SHIP_IPC.pushBase, (_event, raw: unknown) => pushBaseAgain(raw))
  ipcMain.handle(SHIP_IPC.prepush, (_event, raw: unknown) => shipPrepush(raw))
  ipcMain.handle(SHIP_IPC.diffSince, (_event, raw: unknown) => diffSince(raw))
  ipcMain.handle(SHIP_IPC.diffSinceWithCut, (_event, raw: unknown) => diffSinceWithCut(raw))
  ipcMain.handle(SHIP_IPC.discardSince, (_event, raw: unknown) => discardSince(raw))
  ipcMain.handle(SHIP_IPC.risks, (_event, raw: unknown) => shipRisks(raw))
  ipcMain.handle(SHIP_IPC.baseCi, (_event, raw: unknown) => baseCi(raw))
  ipcMain.handle(SHIP_IPC.baseFailure, (_event, raw: unknown) => baseFailure(raw))
  ipcMain.handle(SHIP_IPC.baseFailing, (_event, raw: unknown) => baseFailing(raw))
  ipcMain.handle(SHIP_IPC.sync, (_event, raw: unknown) => syncWorktree(raw))
  ipcMain.handle(SHIP_IPC.pull, (_event, raw: unknown) => pullWorktree(raw))
  ipcMain.handle(SHIP_IPC.operation, (_event, raw: unknown) => shipOperation(raw))
}
