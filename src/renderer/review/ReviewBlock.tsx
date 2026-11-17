// The review result at the top of Git · 变更 (PRD F13 v1.78, Figma 29R): who reviewed how many files with 重审 and
// 发给 <agent> on the same row, the reviewer's conclusion (one line when there are findings, two otherwise), then the
// findings — tag, title and location under it; tick to send, click to open it in the diff — the first three and
// 其余 N 条. The finding last opened stays marked while its file is open.
import { headlessAgent } from '@shared/agents'
import { Check, ChevronDown, RotateCw } from '../ui/icons'
import { useEffect, useMemo, useState } from 'react'
import type { ReviewComment } from '@shared/review-comments'
import type { SessionId } from '@shared/types'
import { defineMessages } from '@shared/i18n'
import { useLang, useMessages } from '../ui/i18n'
import { StatusGlyph } from '../ui/StatusGlyph'
import { setCommentPicked, useReviewComments } from '../state/review-comments'
import { useWorkspace } from '../state/workspace'
import { changeKey } from '../panels/git/changes-model'
import { useGit } from '../panels/git/store'
import { cancelBackgroundReview, loadSavedReview, startBackgroundReview, useBackgroundReview } from './background'
import { revealInDiff, useReviewFlash } from './reveal'
import { reviewBlockView, sendLabel, sortFindings, type FindingRow } from './review-block-model'
import { sendFindings } from './send'
import styles from './ReviewBlock.module.css'

const M = defineMessages({
  zh: {
    startFailed: (error: string) => `没能开始：${error}`,
    review: '审阅',
    cancel: '取消',
    reviewAgain: '重审',
    sendFailed: (error: string) => `没能发送：${error}`,
    findings: '审阅发现',
    included: '发送时包含这条',
    excluded: '发送时不包含这条',
    tickToSend: '勾选后发给 agent',
    rest: (count: number) => `其余 ${count} 条`
  },
  en: {
    startFailed: (error: string) => `Couldn't start: ${error}`,
    review: 'Review',
    cancel: 'Cancel',
    reviewAgain: 'Review again',
    sendFailed: (error: string) => `Couldn't send: ${error}`,
    findings: 'Review findings',
    included: 'Included when sending',
    excluded: 'Not included when sending',
    tickToSend: 'Tick to send to the agent',
    rest: (count: number) => `${count} more`
  }
})

const FAILURE_SHOWN_MS = 4000
/** Findings listed before 其余 N 条 (Figma 29N). */
const FIRST_ROWS = 3
/** The block reads these rows' comments; one stable empty list keeps the memo from running on every store change. */
const NO_COMMENTS: readonly ReviewComment[] = []

/** Whether the block shows anything for this worktree (running, failed or a result): then it owns 重审 / 取消. */
export function useReviewShown(root: string): boolean {
  const status = useBackgroundReview((s) => s.byRoot[root])
  const comments = useReviewComments((s) => s.byRoot[root]) ?? NO_COMMENTS
  const findings = useMemo(() => comments.filter((c) => c.origin === 'review'), [comments])
  return useMemo(() => reviewBlockView(status, findings) !== null, [status, findings])
}

export function ReviewBlock({ sessionId, root }: { sessionId: SessionId; root: string }) {
  const m = useMessages(M)
  // The view's words are picked when it is built: build it again in the other language.
  const lang = useLang()
  const session = useWorkspace((s) => s.sessions.find((x) => x.id === sessionId))
  const baseBranch = useWorkspace((s) => s.worktrees.find((w) => w.path === root)?.baseBranch)
  const status = useBackgroundReview((s) => s.byRoot[root])
  const comments = useReviewComments((s) => s.byRoot[root]) ?? NO_COMMENTS
  const flashing = useReviewFlash((s) => s.finding)
  const active = useReviewFlash((s) => s.active)
  const expandedFiles = useGit((s) => s.roots[root]?.expanded)
  const [busy, setBusy] = useState<'review' | 'send' | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => loadSavedReview(root), [root])
  useEffect(() => {
    if (!failure) return
    const timer = window.setTimeout(() => setFailure(null), FAILURE_SHOWN_MS)
    return () => window.clearTimeout(timer)
  }, [failure])

  const findings = useMemo(() => comments.filter((c) => c.origin === 'review'), [comments])
  // A finding flashed from its diff tag beyond the first rows opens the whole list, and it stays open (set while
  // rendering: the list must already be open when the flash scrolls to the row).
  if (!expanded && flashing && sortFindings(findings).findIndex((c) => c.id === flashing) >= FIRST_ROWS) setExpanded(true)
  const view = useMemo(() => reviewBlockView(status, findings), [status, findings, lang]) // eslint-disable-line react-hooks/exhaustive-deps
  // The opened finding stays marked while its file is open in the list.
  const opened = active ? findings.find((c) => c.id === active) : undefined
  const activeShown = opened && expandedFiles?.has(changeKey(opened.group, opened.path)) ? opened.id : null
  if (!view) return null

  const agent = headlessAgent(session?.kind)
  const reviewAgain = (): void => {
    if (!agent) return
    setBusy('review')
    setFailure(null)
    startBackgroundReview(root, agent, 'manual', baseBranch, true)
      .catch((error: unknown) => setFailure(m.startFailed(error instanceof Error ? error.message : String(error))))
      .finally(() => setBusy(null))
  }

  if (view.kind === 'running') {
    return (
      <section className={styles.block} aria-label={m.review} data-testid="review-block">
        <div className={styles.head}>
          <span className={styles.running} role="status">
            <StatusGlyph status="running" />
            {view.text}
          </span>
          <span className={styles.spacer} />
          <button type="button" className={styles.action} onClick={() => cancelBackgroundReview(root)}>
            {m.cancel}
          </button>
        </div>
      </section>
    )
  }

  if (view.kind === 'failed') {
    return (
      <section className={styles.block} aria-label={m.review} data-testid="review-block">
        <div className={styles.head}>
          <span className={styles.failed} role="status" title={view.text}>
            {failure ?? view.text}
          </span>
          <span className={styles.spacer} />
          <button type="button" className={styles.action} disabled={!agent || busy !== null} onClick={reviewAgain}>
            {m.reviewAgain}
          </button>
        </div>
      </section>
    )
  }

  const send = (): void => {
    if (!session || !agent) return
    setBusy('send')
    setFailure(null)
    sendFindings(root, session)
      .catch((error: unknown) => setFailure(m.sendFailed(error instanceof Error ? error.message : String(error))))
      .finally(() => setBusy(null))
  }
  const jump = (row: FindingRow): void => {
    const comment = findings.find((c) => c.id === row.id)
    if (comment) void revealInDiff(root, comment)
  }

  // A fourth row costs what 其余 1 条 would.
  const all = expanded || view.rows.length <= FIRST_ROWS + 1
  const rows = all ? view.rows : view.rows.slice(0, FIRST_ROWS)
  const rest = view.rows.length - rows.length

  return (
    <section className={styles.block} aria-label={m.review} data-testid="review-block">
      <div className={styles.head}>
        <span className={styles.title}>{view.header}</span>
        <span className={styles.spacer} />
        {view.rows.length === 0 && view.counts && <span className={styles.counts}>{view.counts}</span>}
        <button
          type="button"
          className={styles.iconAction}
          aria-label={m.reviewAgain}
          title={m.reviewAgain}
          disabled={!agent || busy !== null}
          onClick={reviewAgain}
        >
          <RotateCw size={16} strokeWidth={1.75} aria-hidden />
        </button>
        {agent && view.rows.length > 0 && (
          <button type="button" className={styles.action} disabled={view.picked === 0 || busy !== null} onClick={send}>
            {sendLabel(agent, view.picked)}
          </button>
        )}
      </div>
      {view.summary && (
        <p className={styles.summary} data-lines={view.rows.length > 0 ? 1 : 2} title={view.summary}>
          {view.summary}
        </p>
      )}
      {failure && (
        <p className={styles.failed} role="status">
          {failure}
        </p>
      )}
      {rows.length > 0 && (
        <ul className={styles.list} aria-label={m.findings} data-all={all || undefined}>
          {rows.map((row) => (
            <li
              key={row.id}
              className={styles.finding}
              data-finding-id={row.id}
              data-flash={flashing === row.id || undefined}
              data-active={activeShown === row.id || undefined}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={row.picked}
                aria-label={row.picked ? m.included : m.excluded}
                title={row.picked ? m.included : m.tickToSend}
                className={styles.pick}
                onClick={() => setCommentPicked(root, row.id, !row.picked)}
              >
                {row.picked && <Check size={10} strokeWidth={2.5} aria-hidden />}
              </button>
              <button type="button" className={styles.findingMain} title={row.locationTitle} onClick={() => jump(row)}>
                {row.severity && (
                  <span className={styles.severity} data-tone={row.tone}>
                    {row.severity}
                  </span>
                )}
                <span className={styles.findingText}>
                  <span className={styles.findingTitle}>{row.title}</span>
                  <span className={styles.location}>{row.location}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {view.rows.length > 0 && (rest > 0 || view.ignored) && (
        <div className={styles.more}>
          {/* The checkbox and tag columns, so 其余 N 条 starts where the titles do. */}
          <span className={styles.pickSpace} aria-hidden />
          <span className={styles.severity} data-placeholder aria-hidden>
            P0
          </span>
          {rest > 0 && (
            <button type="button" className={styles.moreButton} aria-expanded={false} onClick={() => setExpanded(true)}>
              {m.rest(rest)}
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden />
            </button>
          )}
          {view.ignored && <span className={styles.counts}>{view.ignored}</span>}
        </div>
      )}
    </section>
  )
}
