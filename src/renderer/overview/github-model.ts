// Pure view model of 看板 · GitHub (PRD F9 v1.177, Figma 77B / 77F): which projects show in which order, the filter,
// a PR's tags, the header's summary and which session handles an item.
import type { BoardItem, BoardPr, GitHubLink } from '@shared/github-board'
import { sameLink } from '@shared/github-board'
import { repoArg } from '@shared/pull-requests'
import type { Project, Session, Worktree } from '@shared/types'
import type { ProjectLoad } from './github-store'

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
  const loads = Object.values(byRoot).filter((p): p is ProjectLoad => !!p)
  let issues = 0
  let prs = 0
  let any = false
  for (const load of loads) {
    if (load.list?.gh !== 'ready' || load.list.project.state !== 'ok') continue
    any = true
    issues += load.list.project.issues.length
    prs += load.list.project.prs.length
  }
  const projects = `${loads.length} 个项目`
  return any ? `${projects} · ${issues} 个 issue · ${prs} 个 PR` : loads.length > 0 ? projects : ''
}

export type TagTone = 'plain' | 'quiet' | 'attention' | 'done' | 'error'

/** A PR row's words after the title (Figma 77B): 草稿, then whose review it waits for or what the review said. */
export function prTags(pr: BoardPr): { text: string; tone: TagTone }[] {
  const tags: { text: string; tone: TagTone }[] = []
  if (pr.draft) tags.push({ text: '草稿', tone: 'quiet' })
  if (pr.reviewRequestedFromMe) tags.push({ text: '待你审阅', tone: 'attention' })
  else if (pr.review === 'approved') tags.push({ text: '已批准', tone: 'done' })
  else if (pr.review === 'changes-requested') tags.push({ text: '要求修改', tone: 'attention' })
  return tags
}

/** The checks' mark: ✓ all passed, ✗ with how many failed, ○ still running; null without checks. */
export function checksMark(pr: BoardPr): { state: 'passing' | 'failing' | 'pending'; text: string } | null {
  const { checks } = pr
  if (checks.state === 'none') return null
  if (checks.state === 'failing') return { state: 'failing', text: `${checks.failing.length} 失败` }
  return { state: checks.state, text: checks.state === 'passing' ? '检查通过' : '检查进行中' }
}

/** The session handling an item: the latest one started on it whose worktree is not archived. */
export function linkedSession(sessions: readonly Session[], worktrees: readonly Worktree[], link: GitHubLink): Session | null {
  const archived = new Set(worktrees.filter((w) => w.archived).map((w) => w.id))
  let best: Session | null = null
  for (const s of sessions) if (sameLink(s.github, link) && !archived.has(s.worktreeId) && (!best || s.startedAt > best.startedAt)) best = s
  return best
}

export const linkOf = (repo: Parameters<typeof repoArg>[0], item: Pick<BoardItem, 'kind' | 'number'>): GitHubLink => ({ repo: repoArg(repo), kind: item.kind, number: item.number })
