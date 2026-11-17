// 看板批量操作 (PRD F9 v1.59; no Figma frame yet): with sessions picked (⌘ / ⇧ click) a bar at the bottom of the
// overview offers 发送消息… · 停止 N 个 · 关闭 N 个. Every button names how many it reaches; 发送消息 first opens a box
// for the text, which lists exactly who gets it, and nothing is typed into any agent before the confirmation that
// quotes the text and names every recipient (PRD §2). Sessions an action cannot reach are skipped and said so.
import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from '../ui/icons'
import { useShallow } from 'zustand/react/shallow'
import {
  batchButtonLabel,
  batchConfirmation,
  batchPlan,
  batchResultText,
  MAX_BROADCAST_TEXT,
  recipientsLine,
  skippedText,
  type BatchAction,
  type BatchCandidate
} from '@shared/batch-actions'
import type { SessionId } from '@shared/types'
import { defineMessages } from '@shared/i18n'
import { useMessages } from '../ui/i18n'
import { ensureAgentUp } from '../lifecycle/agent-up'
import { interruptAgent, submitPrompt } from '../session-io'
import { useWorkspace } from '../state/workspace'
import { IconButton } from '../ui/IconButton'
import enterStyles from './EnterButton.module.css'
import styles from './BatchBar.module.css'

const M = defineMessages({
  zh: {
    withBranch: (title: string, branch: string) => `${title}（${branch}）`,
    toolbar: '批量操作',
    picked: (n: number) => `已选 ${n} 个`,
    sendMessage: '发送消息…',
    stopTitle: (recipients: string) => `${recipients}：向每个 agent 发送一次 Esc，先确认`,
    noneRunning: '选中的会话都没在运行',
    stopping: '正在停止…',
    closeTitle: (recipients: string) => `${recipients}，先确认`,
    clear: '取消选择',
    clearTitle: '取消选择 · Esc',
    messageLabel: '要发送的消息',
    placeholder: '发给选中的每个 agent 的同一段话',
    tooLong: (n: number) => `最多 ${n} 个字`,
    cancel: '取消',
    sendTitle: '先确认，再把这段话发给每个会话并按回车（用你自己的额度）',
    sending: '正在发送…'
  },
  en: {
    withBranch: (title: string, branch: string) => `${title} (${branch})`,
    toolbar: 'Batch actions',
    picked: (n: number) => `${n} selected`,
    sendMessage: 'Send message…',
    stopTitle: (recipients: string) => `${recipients}: sends Esc to each agent once, after you confirm`,
    noneRunning: 'None of the selected sessions is running',
    stopping: 'Stopping…',
    closeTitle: (recipients: string) => `${recipients}, after you confirm`,
    clear: 'Clear selection',
    clearTitle: 'Clear selection · Esc',
    messageLabel: 'Message to send',
    placeholder: 'The same message for every selected agent',
    tooLong: (n: number) => `At most ${n} characters`,
    cancel: 'Cancel',
    sendTitle: 'Asks first, then sends this to every session and presses Enter (uses your own usage)',
    sending: 'Sending…'
  }
})

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export function BatchBar({ ids, onClear, onSettled }: { ids: readonly SessionId[]; onClear(): void; /** The keyboard goes back to the list. */ onSettled(): void }) {
  const m = useMessages(M)
  const { sessions, worktrees } = useWorkspace(useShallow((s) => ({ sessions: s.sessions, worktrees: s.worktrees })))
  const candidates = useMemo(() => {
    const picked = ids.flatMap((id) => sessions.filter((x) => x.id === id))
    // 一题多解's members share a title: their branch tells them apart in the recipients and the confirmation.
    const repeated = (title: string) => picked.filter((x) => x.title === title).length > 1
    return picked.map((s): BatchCandidate => {
      const branch = worktrees.find((w) => w.id === s.worktreeId)?.branch
      const title = repeated(s.title) && branch ? m.withBranch(s.title, branch) : s.title
      return { id: s.id, kind: s.kind, title, status: s.status, ...(s.phase ? { phase: s.phase } : {}) }
    })
  }, [ids, sessions, worktrees, m])
  const [composing, setComposing] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<BatchAction | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (composing) textRef.current?.focus()
  }, [composing])

  const send = batchPlan('send', candidates)
  const stop = batchPlan('stop', candidates)
  const close = batchPlan('close', candidates)

  const run = async (action: BatchAction): Promise<void> => {
    const plan = action === 'send' ? send : action === 'stop' ? stop : close
    const confirm = batchConfirmation(plan, text)
    if (!confirm || busy) return
    if (!(await window.tr.ui.confirm(confirm))) return
    setBusy(action)
    setResult(null)
    const failures: Array<{ title: string; message: string }> = []
    let done = 0
    if (action === 'close') {
      for (const target of plan.targets) useWorkspace.getState().closeSession(target.id)
      done = plan.targets.length
    } else {
      await Promise.all(
        plan.targets.map(async (target) => {
          try {
            if (action === 'send') {
              // A session restored from disk starts (resuming its conversation) before it takes the message.
              await ensureAgentUp(target.id)
              // The user's own message: a leader's turn this starts is theirs (PRD F21 v1.198).
              await submitPrompt(target.id, text, { user: true })
            } else {
              await interruptAgent(target.id)
            }
            done++
          } catch (error) {
            failures.push({ title: target.title, message: message(error) })
          }
        })
      )
    }
    setBusy(null)
    setResult(batchResultText(action, done, failures))
    if (action === 'send' && failures.length === 0) {
      setComposing(false)
      setText('')
    }
    if (action === 'close') onClear()
    else onSettled()
  }

  const tooLong = text.length > MAX_BROADCAST_TEXT
  const canSend = send.targets.length > 0 && text.trim() !== '' && !tooLong
  const skipped = skippedText(send)

  return (
    <div className={styles.bar} role="toolbar" aria-label={m.toolbar} data-testid="batch-bar">
      <div className={styles.line}>
        <span className={styles.count}>{m.picked(candidates.length)}</span>
        {!composing && (
          <>
            <button type="button" className={enterStyles.enter} disabled={send.targets.length === 0 || busy !== null} onClick={() => setComposing(true)} title={recipientsLine(send)}>
              {m.sendMessage}
            </button>
            <button
              type="button"
              className={enterStyles.enter}
              disabled={stop.targets.length === 0 || busy !== null}
              title={stop.targets.length > 0 ? m.stopTitle(recipientsLine(stop)) : m.noneRunning}
              onClick={() => void run('stop')}
            >
              {busy === 'stop' ? m.stopping : batchButtonLabel('stop', stop.targets.length)}
            </button>
            <button type="button" className={enterStyles.enter} disabled={busy !== null} title={m.closeTitle(recipientsLine(close))} onClick={() => void run('close')}>
              {batchButtonLabel('close', close.targets.length)}
            </button>
          </>
        )}
        {result && (
          <span className={styles.result} role="status">
            {result}
          </span>
        )}
        <span className={styles.spacer} />
        <IconButton label={m.clear} title={m.clearTitle} onClick={onClear}>
          <X size={16} strokeWidth={1.75} />
        </IconButton>
      </div>
      {composing && (
        <div className={styles.compose}>
          <textarea
            ref={textRef}
            className={styles.textarea}
            aria-label={m.messageLabel}
            placeholder={m.placeholder}
            value={text}
            rows={2}
            spellCheck={false}
            onChange={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter' && e.metaKey) {
                e.preventDefault()
                if (canSend) void run('send')
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                setComposing(false)
                onSettled()
              }
            }}
          />
          <div className={styles.composeFoot}>
            <span className={styles.recipients} data-testid="batch-recipients">
              {recipientsLine(send)}
              {skipped && <span className={styles.skipped}> · {skipped}</span>}
              {tooLong && <span className={styles.skipped}> · {m.tooLong(MAX_BROADCAST_TEXT)}</span>}
            </span>
            <span className={styles.spacer} />
            <button type="button" className={enterStyles.enter} onClick={() => setComposing(false)}>
              {m.cancel}
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={!canSend || busy !== null}
              title={m.sendTitle}
              onClick={() => void run('send')}
            >
              {busy === 'send' ? m.sending : batchButtonLabel('send', send.targets.length)}
              <span className={styles.shortcut}>⌘↵</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
