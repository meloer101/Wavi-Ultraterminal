// 合并到 GitHub PR (PRD F16 v1.63, Figma 22C 364:14009 / 22D 369:14631): the PR's checklist as main last read it —
// checks, whether the PR is the code here, conflicts, approvals and threads (those only inform), Wavi's review and the
// agent's own checks — then the methods the repository allows and removing the remote branch. 合并 is pinned to the head
// main checked; while checks run it becomes 检查通过后合并 (GitHub auto-merge; refused when the repository has it off).
// Archiving after the merge is 合并后自动归档's (pull-requests/auto-archive.ts), not this sheet's.
import { headlessAgent } from '@shared/agents'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { ArrowRight, CircleX, GitBranch } from '../../ui/icons'
import { severityCounts } from '@shared/background-review'
import type { MergeMethod, PrStatus } from '@shared/pull-requests'
import { defineMessages } from '@shared/i18n'
import { useMessages } from '../../ui/i18n'
import { loadSavedReview, reviewLine, useBackgroundReview } from '../../review/background'
import { useReviewComments } from '../../state/review-comments'
import { useWorkspace } from '../../state/workspace'
import { useTurnCheckView } from '../../turn-checks/TurnChecksTag'
import { Segmented } from '../../ui/Segmented'
import { agentLabel, agentSessionFor, type CheckLine } from './model'
import { Checkbox, Line, TurnChecks } from './parts'
import { METHOD_LABEL, prMergeView } from './pr-model'
import { closeMergeSheet, type MergeTarget } from './store'
import styles from './MergeSheet.module.css'

const M = defineMessages({
  zh: {
    githubMerges: '检查通过后由 GitHub 合并',
    mergeAs: (viewer: string | null) => `以 @${viewer || '你的账号'} 合并 · 分支保护照样由 GitHub 执行`,
    mergeTo: '合并到',
    method: '合并方式',
    onlyMethods: (count: number) => `仓库只允许${count === 1 ? '这一种' : `这 ${count} 种`}`,
    deleteRemote: '合并后删除远程分支（本地分支保留）',
    repoDeletes: '仓库设置了合并后自动删除',
    repoDecides: '检查通过后合并时由仓库设置决定',
    cancel: '取消',
    done: '完成',
    merging: '正在合并…',
    mergeWhenGreen: '检查通过后合并',
    mergePr: (number: number) => `合并 PR #${number}`
  },
  en: {
    githubMerges: 'GitHub merges once the checks pass',
    mergeAs: (viewer: string | null) => `Merging as @${viewer || 'your account'} · GitHub still enforces branch protection`,
    mergeTo: 'Merge into',
    method: 'Merge method',
    onlyMethods: (count: number) => (count === 1 ? 'The repository allows only this one' : `The repository allows only these ${count}`),
    deleteRemote: 'Delete the remote branch after merging (the local branch stays)',
    repoDeletes: 'The repository deletes it after merging',
    repoDecides: "When merging after the checks pass, the repository's setting decides",
    cancel: 'Cancel',
    done: 'Done',
    merging: 'Merging…',
    mergeWhenGreen: 'Merge when green',
    mergePr: (number: number) => `Merge PR #${number}`
  }
})

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

type Phase = { kind: 'ready' } | { kind: 'merging' } | { kind: 'done'; lines: CheckLine[] }

export function PrMergeSheet({ target, status, targetSwitch }: { target: MergeTarget; status: PrStatus; targetSwitch: ReactNode }) {
  const t = useMessages(M)
  const titleId = useId()
  const sheetRef = useRef<HTMLDivElement>(null)
  const ids = target.worktreeIds
  const sessions = useWorkspace((s) => s.sessions)
  const activeId = useWorkspace((s) => s.activeSessionId)
  const agent = agentSessionFor(
    sessions.filter((s) => ids.includes(s.worktreeId)),
    activeId
  )
  const view = prMergeView(status, agent ? agentLabel(agent.kind) : undefined)
  const pr = status.pr!
  const details = pr.details!
  const [method, setMethod] = useState<MergeMethod>(view?.defaultMethod ?? 'squash')
  const [deleteRemote, setDeleteRemote] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' })
  const [failure, setFailure] = useState<string | null>(null)

  const reviewAgent = headlessAgent(agent?.kind)
  const review = useBackgroundReview((s) => s.byRoot[target.worktreePath])
  const reviewComments = useReviewComments((s) => s.byRoot[target.worktreePath])
  const checksView = useTurnCheckView(agent?.id)
  useEffect(() => loadSavedReview(target.worktreePath), [target.worktreePath])
  useEffect(() => sheetRef.current?.focus(), [])

  if (!view) return null
  const reviewCheck = review ? reviewLine(review, severityCounts((reviewComments ?? []).filter((c) => c.origin === 'review')), reviewAgent ?? undefined) : null
  const busy = phase.kind === 'merging'
  const blocked = view.blockers.length > 0
  const methods = view.methods.length > 0 ? view.methods : (['merge'] as MergeMethod[])

  const merge = async (): Promise<void> => {
    if (blocked || busy) return
    setFailure(null)
    setPhase({ kind: 'merging' })
    const when = view.waitForChecks ? 'when-ready' : 'now'
    let result
    try {
      result = await window.tr.pr.merge({ root: target.root, worktree: target.worktreePath, method, when, deleteRemoteBranch: deleteRemote && when === 'now' })
    } catch (error) {
      result = { ok: false as const, reason: 'failed' as const, message: error instanceof Error ? error.message : String(error) }
    }
    if (!result.ok) {
      if (result.reason !== 'declined') setFailure(result.message)
      setPhase({ kind: 'ready' })
      return
    }
    const lines: CheckLine[] = [{ tone: result.outcome === 'merged' ? 'ok' : 'working', text: result.message }]
    // The local base could not be brought up to the merged remote base (合入链路 v2): said with the result.
    if (result.baseNotCaughtUp) lines.push({ tone: 'warn', text: result.baseNotCaughtUp })
    setPhase({ kind: 'done', lines })
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return
    if (event.key === 'Escape' && !busy) {
      event.preventDefault()
      closeMergeSheet(true)
    } else if (event.key === 'Enter' && event.metaKey) {
      event.preventDefault()
      if (phase.kind === 'done') closeMergeSheet(true)
      else void merge()
    }
  }
  const onScrim = (event: MouseEvent): void => {
    if (event.target === event.currentTarget && !busy) closeMergeSheet(true)
  }

  const who = view.waitForChecks ? t.githubMerges : t.mergeAs(details.viewer)

  return (
    <div className={styles.scrim} onMouseDown={onScrim} data-region="merge">
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        data-testid="merge-sheet"
        data-target="pr"
      >
        <header className={styles.context}>
          <div className={styles.titleRow}>
            <h2 id={titleId} className={styles.title}>
              {t.mergeTo}
            </h2>
            {targetSwitch}
          </div>
          <p className={styles.branches}>
            <GitBranch {...ICON} />
            <span>{status.branch}</span>
            <ArrowRight {...ICON} />
            <span>PR #{pr.number}</span>
          </p>
        </header>

        <div className={styles.checks} aria-live="polite">
          {phase.kind === 'done'
            ? phase.lines.map((line) => <Line key={line.text} line={line} />)
            : view.lines.map((line) => <Line key={line.text} line={line} />)}
          {phase.kind !== 'done' && reviewCheck && (
            <Line line={{ tone: reviewCheck.tone === 'muted' ? 'warn' : reviewCheck.tone, text: reviewCheck.text, ...(reviewCheck.meta ? { meta: reviewCheck.meta } : {}) }} />
          )}
          {phase.kind !== 'done' && agent && checksView && <TurnChecks view={checksView} kind={agent.kind} />}
        </div>

        {phase.kind !== 'done' && !blocked && (
          <div className={styles.options}>
            <div className={styles.field} role="group" aria-label={t.method}>
              <span className={styles.label}>{t.method}</span>
              <div className={styles.control}>
                <Segmented label={t.method} value={methods.includes(method) ? method : methods[0]!} options={methods.map((m) => ({ value: m, label: METHOD_LABEL[m] }))} onChange={setMethod} />
                {methods.length < 3 && <p className={styles.note}>{t.onlyMethods(methods.length)}</p>}
              </div>
            </div>
            <div className={styles.field}>
              <span className={styles.label} />
              <div className={styles.control}>
                <Checkbox
                  checked={details.repo.deleteBranchOnMerge || (deleteRemote && !view.waitForChecks)}
                  disabled={details.repo.deleteBranchOnMerge || view.waitForChecks || busy}
                  onChange={setDeleteRemote}
                  label={t.deleteRemote}
                  note={details.repo.deleteBranchOnMerge ? t.repoDeletes : view.waitForChecks ? t.repoDecides : null}
                />
              </div>
            </div>
          </div>
        )}

        {failure && (
          <p className={styles.failure} role="alert">
            <CircleX {...ICON} />
            {failure}
          </p>
        )}

        <footer className={styles.footer}>
          {phase.kind !== 'done' && <span className={styles.footerNote}>{blocked ? view.blockers[0] : who}</span>}
          <span className={styles.spacer} />
          {phase.kind !== 'done' && (
            <button type="button" className={styles.cancel} disabled={busy} onClick={() => closeMergeSheet(true)}>
              {t.cancel}
            </button>
          )}
          {phase.kind === 'done' ? (
            <button type="button" className={styles.primary} onClick={() => closeMergeSheet(true)}>
              {t.done}
              <span data-shortcut-hint className={styles.shortcut}>⌘↵</span>
            </button>
          ) : (
            <button type="button" className={styles.primary} disabled={blocked || busy} onClick={() => void merge()}>
              {busy ? t.merging : view.waitForChecks ? t.mergeWhenGreen : t.mergePr(pr.number)}
              <span data-shortcut-hint className={styles.shortcut}>⌘↵</span>
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
