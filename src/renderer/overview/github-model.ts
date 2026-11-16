// Pure view model of 看板 · GitHub (PRD F9 v1.184, Figma 77B / 77F): which projects show in which order, the filter,
// a PR's tags, the header's summary and which session handles an item.
import type { BoardItem, BoardPr, GitHubLink } from '@shared/github-board'
import { repoArg } from '@shared/pull-requests'
import type { Project, Session, Worktree } from '@shared/types'
import type { ProjectLoad } from './github-store'
import { defineMessages, pick } from '@shared/i18n'

const M = defineMessages({
  zh: {
    projects: (n: number) => `${n} 个项目`,
    issues: (n: number) => `${n} 个 issue`,
    prs: (n: number) => `${n} 个 PR`,
    draft: '草稿',
    reviewRequested: '待你审阅',
    approved: '已批准',
    changesRequested: '要求修改',
    failing: (n: number) => `${n} 失败`,
    passing: '检查通过',
    pending: '检查进行中'
  },
  en: {
    projects: (n: number) => (n === 1 ? '1 project' : `${n} projects`),
    issues: (n: number) => (n === 1 ? '1 issue' : `${n} issues`),
    prs: (n: number) => (n === 1 ? '1 PR' : `${n} PRs`),
    draft: 'Draft',
    reviewRequested: 'Your review',
    approved: 'Approved',
    changesRequested: 'Changes requested',
    failing: (n: number) => `${n} failing`,
    passing: 'Checks passed',
    pending: 'Checks running'
  }
})

/** Filter text: every word must match — `#139` / `139` the number, anything else the title, a label or the author. */
export function matchesFilter(item: BoardItem, filter: string): boolean {
  const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return words.every((word) => {
    const number = /^#?(\d+)$/.exec(word)
    if (number) return String(item.number).startsWith(number[1]!)
    return item.title.toLowerCase().includes(word) || item.author.toLowerCase().includes(word) || item.labels.some((l) => l.toLowerCase().includes(word))
  })
}

/** Projects on GitHub (or not known yet) in the workspace's order, then the ones that are not, folded (77F). */
export function orderProjects(projects: readonly Project[], byRoot: Readonly<Record<string, ProjectLoad | undefined>>): { project: Project; offGitHub: boolean }[] {
  const off = (p: Project): boolean => {
    const list = byRoot[p.rootPath]?.list
    return !!list && list.gh === 'ready' && list.project.state === 'not-github'
  }
  return [...projects.filter((p) => !off(p)).map((project) => ({ project, offGitHub: false })), ...projects.filter(off).map((project) => ({ project, offGitHub: true }))]
}

/** gh is not usable: the page says so instead of the projects (77G). Null while any project got through to GitHub. */
export function ghProblem(byRoot: Readonly<Record<string, ProjectLoad | undefined>>): 'missing' | 'signed-out' | null {
  for (const load of Object.values(byRoot)) {
    const gh = load?.list?.gh
    if (gh === 'missing' || gh === 'signed-out') return gh
  }
  return null
}

export function githubSummary(byRoot: Readonly<Record<string, ProjectLoad | undefined>>): string {
  // Projects known not to be on GitHub are not counted (Figma 77F: they sit folded at the bottom).
  const loads = Object.values(byRoot).filter((p): p is ProjectLoad => !!p && !(p.list?.gh === 'ready' && p.list.project.state === 'not-github'))
  let issues = 0
  let prs = 0
  let any = false
  for (const load of loads) {
    if (load.list?.gh !== 'ready' || load.list.project.state !== 'ok') continue
    any = true
    issues += load.list.project.issues.length
    prs += load.list.project.prs.length
  }
  const m = pick(M)
  const projects = m.projects(loads.length)
  return any ? `${projects} · ${m.issues(issues)} · ${m.prs(prs)}` : loads.length > 0 ? projects : ''
}

/** Color only for what needs the user (Figma 77′B): 待你审阅 and 要求修改; the rest stays neutral. */
export type TagTone = 'plain' | 'quiet' | 'attention'

/** A PR row's words after the title (Figma 77′B): 草稿, then whose review it waits for or what the review said. */
export function prTags(pr: BoardPr): { text: string; tone: TagTone }[] {
  const tags: { text: string; tone: TagTone }[] = []
  const m = pick(M)
  if (pr.draft) tags.push({ text: m.draft, tone: 'quiet' })
  if (pr.reviewRequestedFromMe) tags.push({ text: m.reviewRequested, tone: 'attention' })
  else if (pr.review === 'approved') tags.push({ text: m.approved, tone: 'plain' })
  else if (pr.review === 'changes-requested') tags.push({ text: m.changesRequested, tone: 'attention' })
  return tags
}

/** The checks' mark: ✓ all passed, ✗ with how many failed, ○ still running; null without checks. */
export function checksMark(pr: BoardPr): { state: 'passing' | 'failing' | 'pending'; text: string } | null {
  const { checks } = pr
  if (checks.state === 'none') return null
  const m = pick(M)
  if (checks.state === 'failing') return { state: 'failing', text: m.failing(checks.failing.length) }
  return { state: checks.state, text: checks.state === 'passing' ? m.passing : m.pending }
}

/** A link's key in linkedSessions' map: the repository without case, the kind and the number. */
export const linkKey = (link: GitHubLink): string => `${link.repo.toLowerCase()}#${link.kind}#${link.number}`

/** The session handling each item: the latest one started on it whose worktree is not archived (one pass for all rows). */
export function linkedSessions(sessions: readonly Session[], worktrees: readonly Worktree[]): Map<string, Session> {
  const archived = new Set(worktrees.filter((w) => w.archived).map((w) => w.id))
  const byLink = new Map<string, Session>()
  for (const s of sessions) {
    if (!s.github || archived.has(s.worktreeId)) continue
    const key = linkKey(s.github)
    const best = byLink.get(key)
    if (!best || s.startedAt > best.startedAt) byLink.set(key, s)
  }
  return byLink
}

export const linkOf = (repo: Parameters<typeof repoArg>[0], item: Pick<BoardItem, 'kind' | 'number'>): GitHubLink => ({ repo: repoArg(repo), kind: item.kind, number: item.number })
