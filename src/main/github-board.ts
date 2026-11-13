// 看板 · GitHub (PRD F9 v1.177): a project's open issues and PRs, one item's body and comments, and fetching a PR's
// head for the worktree that handles it — all with the user's own `gh` login, as F16 does (pull-requests.ts runs gh:
// its PATH, environment, concurrency and the pause after a rate limit). Nothing polls: the window asks when the
// 看板 · GitHub tab opens and on 刷新; answers are kept a minute. Only workspace project roots are accepted, and what the
// renderer sends never reaches git or gh where it could be read as an option.
import { ipcMain } from 'electron'
import {
  GITHUB_BOARD_IPC,
  listArgs,
  parseDetail,
  parseIssueList,
  parseItemRequest,
  parseListRequest,
  parsePrHead,
  parsePrList,
  viewArgs,
  type BoardDetailResult,
  type BoardList,
  type BoardProject,
  type BoardPrStart
} from '@shared/github-board'
import { ghResolvedRemote, isRateLimited, isSignedOut, repoArg, type GitHubRepo } from '@shared/pull-requests'
import { git, gitOut, lastLines, pushEnv, refExists } from './git/run'
import { detectGh, gh, ghPausedUntil, gitHubRepoFromUrl, pauseGhForRateLimit } from './pull-requests'
import { isProjectRoot } from './workspace-store'

/** A list answer is reused this long unless 刷新 asks again. */
const LIST_TTL_MS = 60_000
const FETCH_TIMEOUT_MS = 60_000

const cache = new Map<string, { at: number; project: BoardProject }>()
let viewer: { login: string | null } | null = null

/** The project's GitHub repository and the remote it is on: gh's set-default remote, else origin, else the first. */
export async function projectRepo(root: string): Promise<{ repo: GitHubRepo; remote: string } | null> {
  const [resolved, listed] = await Promise.all([gitOut(root, ['config', '--get-regexp', '^remote\\..*\\.gh-resolved$']), gitOut(root, ['remote'])])
  const remotes = listed.split('\n').map((r) => r.trim()).filter(Boolean)
  const preferred = ghResolvedRemote(resolved)
  const order = [...new Set([...(preferred && remotes.includes(preferred) ? [preferred] : []), ...(remotes.includes('origin') ? ['origin'] : []), ...remotes])]
  for (const remote of order) {
    const repo = await gitHubRepoFromUrl(await gitOut(root, ['remote', 'get-url', '--', remote]))
    if (repo) return { repo, remote }
  }
  return null
}

/** The gh user's login, lower case (to mark PRs waiting for their review); asked once, null when gh would not say. */
async function viewerLogin(): Promise<string | null> {
  if (viewer) return viewer.login
  const ran = await gh(['api', 'user', '--jq=.login'])
  const login = ran.code === 0 ? ran.stdout.trim().toLowerCase() : ''
  // A failure is asked again next time; an answer is kept for the app's life.
  if (ran.code === 0) viewer = { login: /^[a-z0-9-]{1,39}$/.test(login) ? login : null }
  return ran.code === 0 ? viewer?.login ?? null : null
}

/** gh's words for a failed call, after noting a rate limit (every gh call then waits, as F16's do). */
function failure(stderr: string, stdout: string, code: number): string {
  const output = stderr.trim() || stdout.trim()
  if (isRateLimited(output)) {
    pauseGhForRateLimit()
    return '到了 GitHub 的请求上限，稍后再试'
  }
  if (isSignedOut(output)) return 'gh 还没有登录：在终端运行 gh auth login'
  return lastLines(output, 2, 200) || `gh 退出码 ${code}`
}

const paused = (): string | null => (ghPausedUntil() > Date.now() ? '到了 GitHub 的请求上限，稍后再试' : null)

async function ghJson(args: string[]): Promise<{ json: unknown } | { error: string }> {
  const ran = await gh(args)
  if (ran.code !== 0) return { error: failure(ran.stderr, ran.stdout, ran.code) }
  try {
    return { json: JSON.parse(ran.stdout) as unknown }
  } catch {
    return { error: 'gh 没有输出 JSON' }
  }
}

export async function listBoard(raw: unknown): Promise<BoardList> {
  const request = parseListRequest(raw)
  if (!request || !isProjectRoot(request.root)) return { gh: 'ready', project: { state: 'error', message: '请求无效' } }
  const state = await detectGh()
  if (state !== 'ready') return { gh: state }
  const key = `${request.root}\n${request.scope}`
  const hit = cache.get(key)
  if (!request.force && hit && Date.now() - hit.at < LIST_TTL_MS) return { gh: 'ready', project: hit.project }
  const where = await projectRepo(request.root)
  if (!where) return { gh: 'ready', project: { state: 'not-github' } }
  const wait = paused()
  if (wait) return { gh: 'ready', project: { state: 'error', message: wait } }
  const issueArgs = listArgs('issue', request.scope, where.repo)
  const prArgs = listArgs('pr', request.scope, where.repo)
  const [issues, prs, me] = await Promise.all([
    issueArgs ? ghJson(issueArgs) : Promise.resolve({ json: [] }),
    prArgs ? ghJson(prArgs) : Promise.resolve({ json: [] }),
    viewerLogin()
  ])
  if ('error' in issues || 'error' in prs) {
    const message = 'error' in issues ? issues.error : 'error' in prs ? prs.error : ''
    console.error(`[github-board] listing ${repoArg(where.repo)} failed:`, message)
    return { gh: 'ready', project: { state: 'error', message } }
  }
  const project: BoardProject = { state: 'ok', repo: where.repo, issues: parseIssueList(issues.json), prs: parsePrList(prs.json, me), fetchedAt: Date.now() }
  cache.set(key, { at: Date.now(), project })
  return { gh: 'ready', project }
}

export async function boardDetail(raw: unknown): Promise<BoardDetailResult> {
  const request = parseItemRequest(raw)
  if (!request || !isProjectRoot(request.root)) return { ok: false, message: '请求无效' }
  if ((await detectGh()) !== 'ready') return { ok: false, message: 'gh 还没有登录：在终端运行 gh auth login' }
  const where = await projectRepo(request.root)
  if (!where) return { ok: false, message: '这个项目不在 GitHub 上' }
  const wait = paused()
  if (wait) return { ok: false, message: wait }
  const result = await ghJson(viewArgs(request.kind, request.number, where.repo))
  if ('error' in result) {
    console.error(`[github-board] reading ${repoArg(where.repo)}#${request.number} failed:`, result.error)
    return { ok: false, message: result.error }
  }
  const detail = parseDetail(request.kind, result.json, where.repo)
  return detail ? { ok: true, detail } : { ok: false, message: 'gh 的输出读不懂' }
}

/**
 * Where a PR's worktree starts. A same-repository PR: its head branch on the project's remote, fetched now (worktree
 * creation fetches again); the new branch takes its name and tracks it. A fork's PR: `refs/pull/<n>/head` fetched to
 * `refs/wavi/pull/<n>` — outside refs/remotes/, so `fetch --prune` keeps it; pushing back to the fork is not offered.
 */
export async function prStart(raw: unknown): Promise<BoardPrStart> {
  const request = parseItemRequest(raw)
  if (!request || request.kind !== 'pr' || !isProjectRoot(request.root)) return { ok: false, message: '请求无效' }
  if ((await detectGh()) !== 'ready') return { ok: false, message: 'gh 还没有登录：在终端运行 gh auth login' }
  const where = await projectRepo(request.root)
  if (!where) return { ok: false, message: '这个项目不在 GitHub 上' }
  const viewed = await ghJson(['pr', 'view', String(request.number), `--repo=${repoArg(where.repo)}`, '--json=headRefName,baseRefName,isCrossRepository'])
  if ('error' in viewed) return { ok: false, message: viewed.error }
  const head = parsePrHead(viewed.json)
  if (!head) return { ok: false, message: 'PR 的分支名读不懂' }
  const env = await pushEnv(request.root)
  const target = head.crossRepo ? `refs/wavi/pull/${request.number}` : `refs/remotes/${where.remote}/${head.headRef}`
  const source = head.crossRepo ? `refs/pull/${request.number}/head` : `refs/heads/${head.headRef}`
  const fetched = await git(request.root, ['fetch', '--quiet', '--no-tags', '--', where.remote, `+${source}:${target}`], { timeout: FETCH_TIMEOUT_MS, env })
  if (fetched.code !== 0 || !(await refExists(request.root, target))) {
    const message = lastLines(fetched.stderr || fetched.stdout, 2, 200)
    console.error(`[github-board] fetching PR #${request.number} of ${repoArg(where.repo)} failed:`, message)
    return { ok: false, message: `没能拉取 PR 的分支：${message || `git 退出码 ${fetched.code}`}` }
  }
  return { ok: true, startAt: target, baseRef: head.baseRef, headRef: head.crossRepo ? null : head.headRef }
}

export function registerGitHubBoardHandlers(): void {
  ipcMain.handle(GITHUB_BOARD_IPC.list, (_event, request: unknown) => listBoard(request))
  ipcMain.handle(GITHUB_BOARD_IPC.detail, (_event, request: unknown) => boardDetail(request))
  ipcMain.handle(GITHUB_BOARD_IPC.prStart, (_event, request: unknown) => prStart(request))
}
