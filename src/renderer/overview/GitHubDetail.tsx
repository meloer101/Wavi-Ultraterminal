// 看板 · GitHub's detail overlay (PRD F9 v1.184, Figma 77′C issue / 77′D PR, as tall as its content): an item's body and comments, a PR's
// branches, size and checks. The bar has 在 GitHub 打开 (system browser) and 交给 agent, which opens 新建会话 with the
// item as its task (Figma 77E). GitHub's Markdown is rendered through the sanitize schema; links and images open in
// the system browser rather than loading here.
import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Check, Circle, CircleDot, ExternalLink, GitPullRequest, X } from 'lucide-react'
import Markdown, { type Components } from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { itemTitle, taskPrompt, type BoardDetail } from '@shared/github-board'
import { repoArg } from '@shared/pull-requests'
import { defineMessages, pick } from '@shared/i18n'
import { useMessages } from '../i18n'
import { formatElapsed } from '../sidebar/format-elapsed'
import { IconButton } from '../ui/IconButton'
import { openNewSessionSheet, type SheetTask } from '../new-session/sheet-store'
import { closeItem, type OpenItem } from './github-store'
import markdownStyles from '../panels/files/MarkdownView.module.css'
import styles from './GitHubBoard.module.css'

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const
const SMALL = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const
const M = defineMessages({
  zh: {
    image: '图片',
    imageAlt: (alt: string) => `图片：${alt}`,
    ago: (elapsed: string) => `${elapsed} 前`,
    openOnGitHub: '在 GitHub 打开',
    fetchingPr: '正在拉取 PR…',
    handToAgent: '交给 agent',
    close: '关闭',
    loading: '加载中…',
    draft: '草稿',
    open: '打开',
    merged: '已合并',
    closed: '已关闭',
    checks: '检查',
    failedAgo: (ago: string) => `失败 · ${ago}`,
    running: '进行中',
    noBody: '*没有正文*',
    comments: '评论',
    olderOnGitHub: (n: number) => `更早的 ${n} 条在 GitHub 上`,
    files: (n: number) => `${n} 个文件`,
    openedBy: (author: string, ago: string) => `${author} ${ago}创建`,
    assignedTo: (names: string[]) => `指派给 ${names.join('、')}`,
    approved: '已批准',
    changesRequested: '要求修改',
    notReviewed: '还没有审阅'
  },
  en: {
    image: 'Image',
    imageAlt: (alt: string) => `Image: ${alt}`,
    ago: (elapsed: string) => `${elapsed} ago`,
    openOnGitHub: 'Open on GitHub',
    fetchingPr: 'Fetching PR…',
    handToAgent: 'Hand to agent',
    close: 'Close',
    loading: 'Loading…',
    draft: 'Draft',
    open: 'Open',
    merged: 'Merged',
    closed: 'Closed',
    checks: 'Checks',
    failedAgo: (ago: string) => `Failed · ${ago}`,
    running: 'Running',
    noBody: '*No description*',
    comments: 'Comments',
    olderOnGitHub: (n: number) => (n === 1 ? '1 earlier comment on GitHub' : `${n} earlier comments on GitHub`),
    files: (n: number) => (n === 1 ? '1 file' : `${n} files`),
    openedBy: (author: string, ago: string) => (ago ? `${author} opened ${ago}` : `Opened by ${author}`),
    assignedTo: (names: string[]) => `Assigned to ${names.join(', ')}`,
    approved: 'Approved',
    changesRequested: 'Changes requested',
    notReviewed: 'Not reviewed yet'
  }
})

const REMARK = [remarkGfm]
const REHYPE = [rehypeRaw, rehypeSanitize]

const external = (url: string | undefined): void => {
  // main hands http(s) from window.open to the system browser.
  if (url && /^https:\/\//i.test(url)) window.open(url, '_blank')
}

const MARKDOWN: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      title={href}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault()
        external(href)
      }}
    >
      {children}
    </a>
  ),
  // Not loaded here (GitHub's attachments need its login, and loading tells the host who looked): a link instead.
  img: ({ src, alt }) => (
    <a
      href={typeof src === 'string' ? src : undefined}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault()
        external(typeof src === 'string' ? src : undefined)
      }}
    >
      {alt ? pick(M).imageAlt(alt) : pick(M).image}
    </a>
  )
}

function GitHubMarkdown({ text }: { text: string }) {
  return (
    <div className={`${markdownStyles.markdown} ${styles.markdown}`}>
      <Markdown remarkPlugins={REMARK} rehypePlugins={REHYPE} components={MARKDOWN}>
        {text}
      </Markdown>
    </div>
  )
}

const ago = (ms: number): string => (ms > 0 ? pick(M).ago(formatElapsed(Date.now() - ms)) : '')

export function GitHubDetail({ item }: { item: OpenItem }) {
  const m = useMessages(M)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [handing, setHanding] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null })
  const result = item.result
  const detail = result?.ok ? result.detail : null

  useEffect(() => dialogRef.current?.focus(), [])

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || e.nativeEvent.isComposing) return
    // Closes this only; the next Esc leaves 看板.
    e.preventDefault()
    e.stopPropagation()
    closeItem()
  }

  const handOff = async (): Promise<void> => {
    if (!detail || handing.busy) return
    const task = await taskFor(detail, item, setHanding)
    if (!task) return
    closeItem()
    openNewSessionSheet(item.projectId, task)
  }

  return (
    <div className={styles.scrim} onMouseDown={(e) => e.target === e.currentTarget && closeItem()}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-label={`#${item.number}`} tabIndex={-1} onKeyDown={onKeyDown} data-testid="github-detail">
        <header className={styles.dialogBar}>
          <span className={styles.icon}>{item.kind === 'pr' ? <GitPullRequest {...ICON} /> : <CircleDot {...ICON} />}</span>
          <span className={styles.number}>#{item.number}</span>
          <h2 className={styles.dialogTitle}>{detail?.title ?? ''}</h2>
          {detail && <span className={styles.repo}>{`${detail.repo.owner}/${detail.repo.name}`}</span>}
          <span className={styles.spacer} />
          {handing.message && <span className={styles.handError}>{handing.message}</span>}
          <IconButton label={m.openOnGitHub} disabled={!detail?.url} onClick={() => external(detail?.url)}>
            <ExternalLink {...ICON} />
          </IconButton>
          <button type="button" className={styles.primary} disabled={!detail || handing.busy} onClick={() => void handOff()}>
            {handing.busy ? m.fetchingPr : m.handToAgent}
          </button>
          <IconButton label={m.close} onClick={closeItem}>
            <X {...ICON} />
          </IconButton>
        </header>
        <div className={styles.dialogBody}>
          {!result && <p className={styles.state}>{m.loading}</p>}
          {result && !result.ok && (
            <p className={styles.state} data-tone="error">
              {result.message}
            </p>
          )}
          {detail && <DetailBody detail={detail} />}
        </div>
      </div>
    </div>
  )
}

function DetailBody({ detail }: { detail: BoardDetail }) {
  const m = useMessages(M)
  const pr = detail.pr
  const failing = pr?.checks.filter((c) => c.verdict === 'failed').length ?? 0
  return (
    <>
      <div className={styles.meta}>
        <span className={styles.metaStrong}>{detail.state === 'open' ? (pr?.draft ? m.draft : m.open) : detail.state === 'merged' ? m.merged : m.closed}</span>
        {metaItems(detail).map((item, i) => (
          <Fragment key={i}>
            <span className={styles.sep} aria-hidden>
              ·
            </span>
            <span className={item.mono ? styles.mono : undefined}>{item.text}</span>
          </Fragment>
        ))}
      </div>
      {pr && pr.checks.length > 0 && (
        <section className={styles.checkList} aria-label={m.checks}>
          <div className={styles.groupHeader}>
            <h3>{m.checks}</h3>
            <span className={styles.count}>{`${pr.checks.length - failing - pr.checks.filter((c) => c.verdict === 'pending').length}/${pr.checks.length}`}</span>
          </div>
          {pr.checks.map((check, i) => (
            <div key={`${check.name}-${i}`} className={styles.checkRow} data-state={check.verdict}>
              {check.verdict === 'passed' ? <Check {...SMALL} /> : check.verdict === 'failed' ? <X {...SMALL} /> : <Circle {...SMALL} />}
              <span className={styles.checkName}>{check.name}</span>
              <span className={styles.checkTime}>
                {check.verdict === 'failed' ? m.failedAgo(ago(check.completedAt ?? 0)) : check.verdict === 'pending' ? m.running : duration(check.startedAt, check.completedAt)}
              </span>
            </div>
          ))}
        </section>
      )}
      {(pr?.checks.length ?? 0) > 0 && <hr className={styles.rule} />}
      <GitHubMarkdown text={detail.body.trim() || m.noBody} />
      <hr className={styles.rule} />
      <div className={styles.groupHeader}>
        <h3>{m.comments}</h3>
        <span className={styles.count}>{detail.commentCount}</span>
      </div>
      {detail.commentCount > detail.comments.length && (
        <button type="button" className={styles.ghost} onClick={() => external(detail.url)}>
          {m.olderOnGitHub(detail.commentCount - detail.comments.length)}
        </button>
      )}
      {detail.comments.map((c, i) => (
        <article key={i} className={styles.comment}>
          <div className={styles.commentWho}>
            <span className={styles.metaStrong}>{c.author}</span>
            <span>{ago(c.createdAt)}</span>
          </div>
          <GitHubMarkdown text={c.body} />
        </article>
      ))}
    </>
  )
}

/** The meta row after the state word (Figma 77′C / 77′D), `·` between the parts. */
function metaItems(detail: BoardDetail): { text: string; mono?: boolean }[] {
  const pr = detail.pr
  const m = pick(M)
  const items: { text: string; mono?: boolean }[] = []
  if (pr) {
    items.push({ text: `${pr.headRef} → ${pr.baseRef}`, mono: true }, { text: `+${pr.additions} −${pr.deletions} · ${m.files(pr.changedFiles)}` })
  } else items.push({ text: m.openedBy(detail.author, ago(detail.createdAt)) })
  for (const label of detail.labels) items.push({ text: label })
  if (detail.assignees.length > 0) items.push({ text: m.assignedTo(detail.assignees) })
  if (pr) items.push({ text: pr.review === 'approved' ? m.approved : pr.review === 'changes-requested' ? m.changesRequested : m.notReviewed })
  return items
}

function duration(start: number | null, end: number | null): string {
  if (start === null || end === null || end < start) return ''
  const seconds = Math.round((end - start) / 1000)
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

/** What 新建会话 gets for this item; a PR's head is fetched first (null, with the reason shown, when that failed). */
async function taskFor(detail: BoardDetail, item: OpenItem, set: (s: { busy: boolean; message: string | null }) => void): Promise<SheetTask | null> {
  const link = { repo: repoArg(detail.repo), kind: detail.kind, number: detail.number }
  const branchFrom = { kind: detail.kind, number: detail.number, title: detail.title }
  const title = itemTitle(detail)
  if (detail.kind === 'issue') return { link, title, prompt: taskPrompt(detail), branch: null, branchFrom, base: null }
  set({ busy: true, message: null })
  const start = await window.tr.githubBoard.prStart({ root: item.root, kind: 'pr', number: item.number }).catch((error: unknown) => ({
    ok: false as const,
    message: error instanceof Error ? error.message : String(error)
  }))
  if (!start.ok) {
    set({ busy: false, message: start.message })
    return null
  }
  set({ busy: false, message: null })
  return { link, title, prompt: taskPrompt(detail, start.headRef === null), branch: start.headRef, branchFrom, base: start.baseRef, startAt: start.startAt }
}

