// 让 agent 审阅 (PRD F13): a ghost button in Git · 变更 and on 待审阅 overview rows. With Wavi's built-in reviewer
// (the default) it starts a read-only background review of all the worktree's changes, shown in the review block at
// the top of Git · 变更 (label 审阅全部改动), and turns into 取消审阅 while it runs. With 审阅方式 · agent 自带命令 it types the agent's own review command into the session,
// disabled with the reason as its tooltip while the agent cannot take it.
import { headlessAgent } from '@shared/agents'
import { useEffect, useState } from 'react'
import type { SessionId } from '@shared/types'
import { defineMessages } from '@shared/i18n'
import { useMessages } from '../i18n'
import { agentLabel } from '../panels/merge/model'
import { useSettings } from '../settings/useSettings'
import { useWorkspace } from '../state/workspace'
import { cancelBackgroundReview, startBackgroundReview, useBackgroundReview } from './background'
import { requestReview, reviewBlocker, reviewCommand } from './review'

const M = defineMessages({
  zh: {
    sendInTerminal: (command: string) => `在终端里发送 ${command}`,
    sendFailed: (error: string) => `没能发送：${error}`,
    notSent: '没能发送',
    sending: '正在发送…',
    agentReview: '让 agent 审阅',
    cancelReview: '取消审阅',
    reviewTitle: (agent: string) => `在后台用 ${agent} 只读审阅全部改动（用你自己的额度），结果显示在变更的顶部`,
    startFailed: (error: string) => `没能开始：${error}`,
    notStarted: '没能开始',
    reviewAll: '审阅全部改动'
  },
  en: {
    sendInTerminal: (command: string) => `Send ${command} in the terminal`,
    sendFailed: (error: string) => `Couldn't send: ${error}`,
    notSent: "Couldn't send",
    sending: 'Sending…',
    agentReview: 'Let agent review',
    cancelReview: 'Cancel review',
    reviewTitle: (agent: string) =>
      `Review all changes read-only in the background with ${agent} (uses your own usage); the result shows at the top of Changes`,
    startFailed: (error: string) => `Couldn't start: ${error}`,
    notStarted: "Couldn't start",
    reviewAll: 'Review all changes'
  }
})

const FAILURE_SHOWN_MS = 4000

export function ReviewButton({ sessionId, className }: { sessionId: SessionId; className?: string }) {
  const m = useMessages(M)
  const session = useWorkspace((s) => s.sessions.find((x) => x.id === sessionId))
  const worktree = useWorkspace((s) => (session ? s.worktrees.find((w) => w.id === session.worktreeId) : undefined))
  const { settings, loaded } = useSettings()
  const status = useBackgroundReview((s) => (worktree ? s.byRoot[worktree.path] : undefined))
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    if (!failure) return
    const timer = window.setTimeout(() => setFailure(null), FAILURE_SHOWN_MS)
    return () => window.clearTimeout(timer)
  }, [failure])

  const agent = headlessAgent(session?.kind)
  if (!session || !worktree || !loaded || !agent) return null

  if (settings.review.mode === 'agent-command') {
    const blocker = reviewBlocker(session)
    return (
      <button
        type="button"
        className={className}
        disabled={blocker !== null || busy}
        title={failure ?? blocker ?? m.sendInTerminal(reviewCommand(agent) ?? '')}
        onClick={(event) => {
          event.stopPropagation()
          setBusy(true)
          setFailure(null)
          requestReview(sessionId)
            .catch((error: unknown) => setFailure(m.sendFailed(error instanceof Error ? error.message : String(error))))
            .finally(() => setBusy(false))
        }}
      >
        {failure ? m.notSent : busy ? m.sending : m.agentReview}
      </button>
    )
  }

  if (status?.phase === 'running') {
    return (
      <button
        type="button"
        className={className}
        title={status.message}
        onClick={(event) => {
          event.stopPropagation()
          cancelBackgroundReview(worktree.path)
        }}
      >
        {m.cancelReview}
      </button>
    )
  }

  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      title={failure ?? m.reviewTitle(agentLabel(agent))}
      onClick={(event) => {
        event.stopPropagation()
        setBusy(true)
        setFailure(null)
        startBackgroundReview(worktree.path, agent, 'manual', worktree.baseBranch)
          .catch((error: unknown) => setFailure(m.startFailed(error instanceof Error ? error.message : String(error))))
          .finally(() => setBusy(false))
      }}
    >
      {failure ? m.notStarted : m.reviewAll}
    </button>
  )
}
