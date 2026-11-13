// 看板 · GitHub (PRD F9 v1.177, Figma 77′B / 77′F / 77G): each project's open issues (left) and PRs (right) through
// the user's gh login, a scope over all of them (text tabs), and a row per item whose end is fixed columns — 检查 (PRs),
// 评论, 时间 — kept in place when empty. A row opens the item (GitHubDetail); a session already started on it takes the
// 评论 and 时间 slot, and clicking that enters it. Projects not on GitHub are folded at the bottom.
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, Circle, CircleDot, GitPullRequest, GitPullRequestDraft, MessageSquare, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { BOARD_SCOPES, type BoardItem, type BoardPr, type BoardProject } from '@shared/github-board'
import { STATUS_LABEL } from '@shared/session-status'
import type { Project, Session } from '@shared/types'
import { subscribeClock } from '../sidebar/clock'
import { formatElapsed } from '../sidebar/format-elapsed'
import { useWorkspace } from '../state/workspace'
import { StatusGlyph } from '../ui/StatusGlyph'
import { glyphStatus } from '../lifecycle/present'
import { checksMark, ghProblem, linkedSessions, linkKey, linkOf, matchesFilter, orderProjects, prTags } from './github-model'
import { openItem, refreshGitHub, setScope, useGitHubBoard } from './github-store'
import { GitHubDetail } from './GitHubDetail'
import { enterSession } from './store'
import styles from './GitHubBoard.module.css'

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const
const SMALL = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const

/** "Now" to the minute on the shared clock: `3h` changes without re-rendering every row each frame. */
const minuteNow = (): number => Math.floor(Date.now() / 60_000) * 60_000

/** Which session handles which item, built once per workspace change for every row. */
const Linked = createContext<ReadonlyMap<string, Session>>(new Map())

export function GitHubBoard({ filter }: { filter: string }) {
  const projects = useWorkspace((s) => s.projects)
  const { sessions, worktrees } = useWorkspace(useShallow((s) => ({ sessions: s.sessions, worktrees: s.worktrees })))
  const linked = useMemo(() => linkedSessions(sessions, worktrees), [sessions, worktrees])
  const { scope, byRoot, open } = useGitHubBoard(useShallow((g) => ({ scope: g.scope, byRoot: g.byRoot, open: g.open })))
  const roots = projects.map((p) => p.rootPath).join('\n')

  // On opening the tab and when projects come or go; main answers from its one-minute cache when it can.
  useEffect(() => refreshGitHub(false), [roots])

  const problem = ghProblem(byRoot)
  if (problem) {
    return (
      <div className={styles.problem} data-testid="github-gh-problem">
        <p>{problem === 'missing' ? '看 GitHub 需要 GitHub CLI：装好 gh 后在终端运行 gh auth login' : 'gh 还没有登录：在终端运行 gh auth login'}</p>
        <button type="button" className={styles.secondary} onClick={() => refreshGitHub(true)}>
          重新检查
        </button>
      </div>
    )
  }
  if (projects.length === 0) return <p className={styles.empty}>还没有项目。</p>

  return (
    <Linked.Provider value={linked}>
    <div className={styles.board} data-testid="github-board">
      <div className={styles.scope} role="radiogroup" aria-label="范围">
        {BOARD_SCOPES.map((option) => (
          <button key={option.value} type="button" role="radio" aria-checked={option.value === scope} className={styles.scopeTab} onClick={() => setScope(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
      {orderProjects(projects, byRoot).map(({ project, offGitHub }) => (
        <ProjectSection key={project.id} project={project} offGitHub={offGitHub} filter={filter} />
      ))}
      {open && <GitHubDetail item={open} />}
    </div>
    </Linked.Provider>
  )
}

function ProjectSection({ project, offGitHub, filter }: { project: Project; offGitHub: boolean; filter: string }) {
  const load = useGitHubBoard((g) => g.byRoot[project.rootPath])
  const scope = useGitHubBoard((g) => g.scope)
  const [folded, setFolded] = useState<boolean | null>(null)
  const isFolded = folded ?? offGitHub
  const result = load?.list?.gh === 'ready' ? load.list.project : null

  return (
    <section className={styles.project} aria-label={project.name} data-testid="github-project">
      <button type="button" className={styles.projectHeader} aria-expanded={!isFolded} onClick={() => setFolded(!isFolded)}>
        <span className={styles.chevron}>{isFolded ? <ChevronRight {...ICON} /> : <ChevronDown {...ICON} />}</span>
        <h2>{project.name}</h2>
        {result?.state === 'ok' && <span className={styles.repo}>{`${result.repo.owner}/${result.repo.name}`}</span>}
        {offGitHub && <span className={styles.repo}>不在 GitHub 上</span>}
      </button>
      {!isFolded && !offGitHub && <ProjectBody project={project} result={result} loading={!result && (load?.loading ?? true)} filter={filter} prsOnly={scope === 'review'} />}
    </section>
  )
}

function ProjectBody({ project, result, loading, filter, prsOnly }: { project: Project; result: BoardProject | null; loading: boolean; filter: string; prsOnly: boolean }) {
  if (loading || !result) return <p className={styles.state}>加载中…</p>
  if (result.state === 'error') {
    return (
      <p className={styles.state} data-tone="error">
        <span>查询失败：{result.message}</span>
        <button type="button" className={styles.ghost} onClick={() => refreshGitHub(true)}>
          重试
        </button>
      </p>
    )
  }
  if (result.state !== 'ok') return null
  if (result.issues.length === 0 && result.prs.length === 0) return <p className={styles.state}>{prsOnly ? '没有请你审阅的 PR' : '没有打开的 issue 和 PR'}</p>
  const issues = result.issues.filter((i) => matchesFilter(i, filter))
  const prs = result.prs.filter((p) => matchesFilter(p, filter))
  const columns: ReactNode[] = []
  if (!prsOnly) columns.push(<Column key="issue" label="Issue" count={issues.length} items={issues} project={project} result={result} />)
  columns.push(<Column key="pr" label="PR" count={prs.length} items={prs} project={project} result={result} />)
  return <div className={styles.columns}>{columns}</div>
}

function Column({ label, count, items, project, result }: { label: string; count: number; items: BoardItem[]; project: Project; result: Extract<BoardProject, { state: 'ok' }> }) {
  return (
    <div className={styles.column} role="group" aria-label={`${project.name} · ${label}`}>
      <div className={styles.groupHeader}>
        <h3>{label}</h3>
        <span className={styles.count}>{count}</span>
      </div>
      {items.map((item) => (
        <ItemRow key={`${item.kind}-${item.number}`} item={item} project={project} result={result} />
      ))}
    </div>
  )
}

function ItemRow({ item, project, result }: { item: BoardItem; project: Project; result: Extract<BoardProject, { state: 'ok' }> }) {
  const linked = useContext(Linked).get(linkKey(linkOf(result.repo, item))) ?? null
  const selected = useGitHubBoard((g) => g.open?.root === project.rootPath && g.open.kind === item.kind && g.open.number === item.number)
  const pr = item.kind === 'pr' ? (item as BoardPr) : null
  const mark = pr ? checksMark(pr) : null
  const now = useSyncExternalStore(subscribeClock, minuteNow)
  return (
    <div className={styles.row} data-selected={selected} data-testid="github-row" data-number={item.number}>
      <button type="button" className={styles.rowMain} onClick={() => openItem(project.id, project.rootPath, item.kind, item.number)} title={item.title}>
        <span className={styles.icon}>{pr ? pr.draft ? <GitPullRequestDraft {...ICON} /> : <GitPullRequest {...ICON} /> : <CircleDot {...ICON} />}</span>
        <span className={styles.number}>#{item.number}</span>
        <span className={styles.title}>{item.title}</span>
        {item.labels.slice(0, 3).map((label) => (
          <span key={label} className={styles.tag}>
            {label}
          </span>
        ))}
        {pr &&
          prTags(pr).map((tag) => (
            <span key={tag.text} className={styles.tag} data-tone={tag.tone}>
              {tag.text}
            </span>
          ))}
        {/* Fixed columns, empty ones kept, so every row's end lines up (Figma 77′B). */}
        {pr && (
          <span className={styles.checks} data-state={mark?.state} title={mark?.text}>
            {mark && (mark.state === 'passing' ? <Check {...SMALL} /> : mark.state === 'failing' ? <X {...SMALL} /> : <Circle {...SMALL} />)}
            {mark?.state === 'failing' && <span>{mark.text}</span>}
          </span>
        )}
        {!linked && (
          <span className={styles.comments} aria-label={item.comments > 0 ? `${item.comments} 条评论` : undefined}>
            {item.comments > 0 && (
              <>
                <MessageSquare {...SMALL} />
                {item.comments}
              </>
            )}
          </span>
        )}
        {!linked && <span className={styles.time}>{item.updatedAt > 0 ? formatElapsed(now - item.updatedAt) : ''}</span>}
      </button>
      {linked && <LinkedSession session={linked} />}
    </div>
  )
}

/** The session started on this item: its status (glyph and word) and title; a click enters it. */
function LinkedSession({ session }: { session: Session }) {
  const status = glyphStatus(session)
  return (
    <button type="button" className={styles.linked} onClick={() => enterSession(session.id)} title="进入会话" data-testid="github-linked">
      <StatusGlyph status={status} />
      <span>{`${STATUS_LABEL[status]} · ${session.title}`}</span>
    </button>
  )
}
