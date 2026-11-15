import { useState } from 'react'
import { defineMessages } from '@shared/i18n'
import type { SessionId } from '@shared/types'
import { submitPrompt } from '../session-io'
import { startSession } from '../state/session-start'
import { useSessionView, useWorkspace } from '../state/workspace'
import { StatusGlyph } from '../ui/StatusGlyph'
import { stopNote } from '@shared/limit-resume'
import { useLimitStop } from '../limit-resume/store'
import { useMetaNow } from '../session-meta/MetaChips'
import { ensureAgentUp } from './agent-up'
import { useMessages } from '../i18n'
import { continuePrompt, errorNextSteps, fixPrompt, type RetryKind } from './error-next-steps'
import { useLaunchIssues } from './launch-issues'
import styles from './SessionErrorBar.module.css'

const M = defineMessages({
  zh: { failed: (error: string) => `没能完成：${error}`, retryTurn: '重试这一轮', restart: '重新启动', fix: '让 agent 修复' },
  en: { failed: (error: string) => `Couldn't finish: ${error}`, retryTurn: 'Retry this turn', restart: 'Restart', fix: 'Ask agent to fix' }
})

async function askToFix(sessionId: SessionId, summary: string): Promise<void> {
  await ensureAgentUp(sessionId)
  await submitPrompt(sessionId, fixPrompt(summary))
}

async function retry(sessionId: SessionId, kind: RetryKind): Promise<void> {
  if (kind === 'continue') await submitPrompt(sessionId, continuePrompt())
  else await startSession(sessionId, { resume: true })
}

/**
 * An errored session says what went wrong and what to do next, under its terminal (phase 2b): the error in one
 * line, "让 agent 修复" (resume if needed, then hand it the error) and 重试.
 */
export function SessionErrorBar({ sessionId }: { sessionId: SessionId }) {
  const active = useSessionView(sessionId)
  const id = active?.session.id ?? null
  const issue = useLaunchIssues((s) => (id ? s.issues[id] : undefined))
  const limit = useLimitStop(id ?? '')
  const now = useMetaNow()
  if (!active) return null
  const steps = errorNextSteps(active.session, issue, limit ? stopNote(limit, now) : undefined)
  if (!steps) return null
  return <Bar key={id} sessionId={active.session.id} summary={steps.summary} canFix={steps.canFix} retryKind={steps.retry} />
}

function Bar({ sessionId, summary, canFix, retryKind }: { sessionId: SessionId; summary: string; canFix: boolean; retryKind: RetryKind | null }) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const m = useMessages(M)

  const run = (action: () => Promise<void>): void => {
    setBusy(true)
    setFailure(null)
    useWorkspace.getState().requestTerminalFocus()
    action()
      .catch((error: unknown) => setFailure(error instanceof Error ? error.message : String(error)))
      .finally(() => setBusy(false))
  }

  return (
    <div className={styles.bar} role="status" data-testid="session-error">
      <span className={styles.glyph}>
        <StatusGlyph status="error" />
      </span>
      <div className={styles.text}>
        <p className={styles.title}>{summary}</p>
        {failure && <p className={styles.detail}>{m.failed(failure)}</p>}
      </div>
      {retryKind && (
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => run(() => retry(sessionId, retryKind))}>
          {retryKind === 'continue' ? m.retryTurn : m.restart}
        </button>
      )}
      {canFix && (
        <button type="button" className={styles.primary} disabled={busy} onClick={() => run(() => askToFix(sessionId, summary))}>
          {m.fix}
        </button>
      )}
    </div>
  )
}
