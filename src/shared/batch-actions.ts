// 看板批量操作 (PRD F9 v1.59): sessions picked with ⌘ / ⇧ in the overview get the same message, are stopped or are
// closed together. Pure: which picked sessions each action reaches and why the others are skipped, the bar's button
// labels and the confirmation that names what will be sent and to whom (PRD §2 — nothing is sent before it).
import { defineMessages, pick } from './i18n'
import type { ConfirmOptions } from './lifecycle'
import type { AgentKind, AgentPhase, SessionId, SessionStatus } from './types'

const M = defineMessages({
  zh: {
    notAgent: '终端不是 agent',
    exited: '已退出',
    notRunning: '没在运行',
    sendTo: (n: number) => (n > 0 ? `发送给 ${n} 个…` : '发送给 0 个'),
    stopN: (n: number) => `停止 ${n} 个`,
    closeN: (n: number) => `关闭 ${n} 个`,
    reasonTitles: (reason: string, titles: readonly string[]) => `${reason}（${titles.join('、')}）`,
    skipped: (n: number, parts: readonly string[]) => `跳过 ${n} 个：${parts.join('；')}`,
    recipients: (action: BatchAction, titles: readonly string[]) => `${action === 'send' ? '发给' : action === 'stop' ? '停止' : '关闭'}：${titles.join('、')}`,
    sendMessage: (n: number) => `把这段话发给 ${n} 个会话并按回车？`,
    sendQuota: '每个会话各算一轮，用你自己的额度。',
    sendConfirm: (n: number) => `发送给 ${n} 个`,
    cancel: '取消',
    stopMessage: (n: number) => `停止 ${n} 个会话正在做的这一轮？`,
    stopDetail: '向每个 agent 发送一次 Esc，和在终端里按 Esc 一样；会话和对话都还在。',
    closeMessage: (n: number) => `关闭 ${n} 个会话？`,
    closeActive: (n: number) => `其中 ${n} 个正在运行或等你处理，关闭会中断它们。`,
    closeKeeps: 'worktree 和分支都留着。',
    closeDropsSnapshots: (n: number) => `其中 ${n} 个是只读快照，快照的 worktree 会一起删掉；其余的 worktree 和分支都留着。`,
    ok: '好',
    result: (action: BatchAction, done: number) => `${action === 'send' ? '已发送给' : action === 'stop' ? '已停止' : '已关闭'} ${done} 个`,
    failed: (head: string, action: BatchAction, failures: ReadonlyArray<{ title: string; message: string }>) =>
      `${head}，${failures.length} 个${action === 'send' ? '没发出去' : action === 'stop' ? '没停下' : '没关掉'}：${failures.map((f) => `${f.title}（${f.message}）`).join('；')}`
  },
  en: {
    notAgent: 'Terminal, not an agent',
    exited: 'Exited',
    notRunning: 'Not running',
    sendTo: (n: number) => (n > 0 ? `Send to ${n}…` : 'Send to 0'),
    stopN: (n: number) => `Stop ${n}`,
    closeN: (n: number) => `Close ${n}`,
    reasonTitles: (reason: string, titles: readonly string[]) => `${reason} (${titles.join(', ')})`,
    skipped: (n: number, parts: readonly string[]) => `Skipping ${n}: ${parts.join('; ')}`,
    recipients: (action: BatchAction, titles: readonly string[]) => `${action === 'send' ? 'To' : action === 'stop' ? 'Stop' : 'Close'}: ${titles.join(', ')}`,
    sendMessage: (n: number) => (n === 1 ? 'Send this to 1 session and press Return?' : `Send this to ${n} sessions and press Return?`),
    sendQuota: 'Each session counts as a turn, on your own usage.',
    sendConfirm: (n: number) => `Send to ${n}`,
    cancel: 'Cancel',
    stopMessage: (n: number) => (n === 1 ? "Stop 1 session's current turn?" : `Stop the current turn of ${n} sessions?`),
    stopDetail: 'Sends Esc to each agent once, the same as pressing Esc in the terminal; the sessions and their conversations stay.',
    closeMessage: (n: number) => (n === 1 ? 'Close 1 session?' : `Close ${n} sessions?`),
    closeActive: (n: number) => `${n} of them ${n === 1 ? 'is' : 'are'} running or need${n === 1 ? 's' : ''} you; closing interrupts ${n === 1 ? 'it' : 'them'}.`,
    closeKeeps: 'Worktrees and branches stay.',
    closeDropsSnapshots: (n: number) =>
      n === 1
        ? '1 of them is a read-only snapshot; its worktree is deleted with it. Other worktrees and branches stay.'
        : `${n} of them are read-only snapshots; their worktrees are deleted with them. Other worktrees and branches stay.`,
    ok: 'OK',
    result: (action: BatchAction, done: number) => `${action === 'send' ? 'Sent to' : action === 'stop' ? 'Stopped' : 'Closed'} ${done}`,
    failed: (head: string, action: BatchAction, failures: ReadonlyArray<{ title: string; message: string }>) =>
      `${head}; ${failures.length} ${action === 'send' ? 'not sent' : action === 'stop' ? 'not stopped' : 'not closed'}: ${failures.map((f) => `${f.title} (${f.message})`).join('; ')}`
  }
})

export type BatchAction = 'send' | 'stop' | 'close'

export interface BatchCandidate {
  id: SessionId
  kind: AgentKind
  title: string
  status: SessionStatus
  phase?: AgentPhase
}

export interface BatchPlan {
  action: BatchAction
  targets: BatchCandidate[]
  skipped: Array<{ candidate: BatchCandidate; reason: string }>
}

/** The native confirmation allows 500 characters per field (main/confirm-spec.ts). */
const MAX_DIALOG_TEXT = 480
const PREVIEW_CHARS = 160
export const MAX_BROADCAST_TEXT = 20_000

/** Any CLI agent takes a message and an Esc; a plain shell does not. */
const isAgent = (c: BatchCandidate): boolean => c.kind !== 'shell'
const exited = (c: BatchCandidate): boolean => c.status === 'exited' || c.phase === 'exited'

/** Why `action` does not reach this session, or null when it does. */
function skipReason(action: BatchAction, c: BatchCandidate): string | null {
  const m = pick(M)
  switch (action) {
    case 'send':
      if (!isAgent(c)) return m.notAgent
      return exited(c) ? m.exited : null
    case 'stop':
      if (!isAgent(c)) return m.notAgent
      return c.status === 'running' ? null : m.notRunning
    case 'close':
      return null
  }
}

export function batchPlan(action: BatchAction, candidates: readonly BatchCandidate[]): BatchPlan {
  const targets: BatchCandidate[] = []
  const skipped: BatchPlan['skipped'] = []
  for (const candidate of candidates) {
    const reason = skipReason(action, candidate)
    if (reason) skipped.push({ candidate, reason })
    else targets.push(candidate)
  }
  return { action, targets, skipped }
}

/** The bar's buttons: what they do and to how many (0 = disabled). */
export function batchButtonLabel(action: BatchAction, count: number): string {
  const m = pick(M)
  switch (action) {
    case 'send':
      return m.sendTo(count)
    case 'stop':
      return m.stopN(count)
    case 'close':
      return m.closeN(count)
  }
}

/** One line per reason: `跳过 2 个：终端不是 agent（终端）、已退出（修复登录）`. */
export function skippedText(plan: BatchPlan): string | null {
  if (plan.skipped.length === 0) return null
  const byReason = new Map<string, string[]>()
  for (const { candidate, reason } of plan.skipped) byReason.set(reason, [...(byReason.get(reason) ?? []), candidate.title])
  const m = pick(M)
  const parts = [...byReason].map(([reason, titles]) => m.reasonTitles(reason, titles))
  return m.skipped(plan.skipped.length, parts)
}

/** `发给：登录页、登录页 2、修复测试` — the recipients by name, as the bar and the confirmation list them. */
export function recipientsLine(plan: BatchPlan): string {
  return pick(M).recipients(plan.action, plan.targets.map((t) => t.title))
}

function preview(text: string): string {
  const chars = [...text.trim().replace(/\s+/g, ' ')]
  return chars.length > PREVIEW_CHARS ? `${chars.slice(0, PREVIEW_CHARS).join('')}…` : chars.join('')
}

const clip = (text: string): string => {
  const chars = [...text]
  return chars.length > MAX_DIALOG_TEXT ? `${chars.slice(0, MAX_DIALOG_TEXT - 1).join('')}…` : text
}

/**
 * The confirmation before anything happens; null when the action reaches no session. Sending says the message and
 * every recipient, and that each one spends a turn of the user's own quota.
 */
/**
 * The confirmation for `plan`. `snapshots`: how many read-only snapshot worktrees the close also deletes (the sidebar's
 * close takes a snapshot's worktree with its last session, PRD F21); the board's close deletes none.
 */
export function batchConfirmation(plan: BatchPlan, text = '', snapshots = 0): ConfirmOptions | null {
  const n = plan.targets.length
  if (n === 0) return null
  const skipped = skippedText(plan)
  const lines = (...parts: Array<string | null>): string => clip(parts.filter((p): p is string => p !== null).join('\n'))
  const m = pick(M)
  switch (plan.action) {
    case 'send':
      return {
        message: clip(m.sendMessage(n)),
        detail: lines(`“${preview(text)}”`, '', recipientsLine(plan), m.sendQuota, skipped),
        confirmLabel: m.sendConfirm(n),
        cancelLabel: m.cancel
      }
    case 'stop':
      return {
        message: m.stopMessage(n),
        detail: lines(m.stopDetail, recipientsLine(plan), skipped),
        confirmLabel: m.stopN(n),
        cancelLabel: m.cancel
      }
    case 'close': {
      const active = plan.targets.filter((t) => t.status === 'running' || t.status === 'needs_you').length
      return {
        message: m.closeMessage(n),
        detail: lines(active > 0 ? m.closeActive(active) : null, snapshots > 0 ? m.closeDropsSnapshots(snapshots) : m.closeKeeps, recipientsLine(plan)),
        confirmLabel: m.closeN(n),
        cancelLabel: m.cancel,
        destructive: true
      }
    }
  }
}

/** The sheet after a batch where some targets failed: the result line and one button. */
export function batchFailureNotice(action: BatchAction, done: number, failures: ReadonlyArray<{ title: string; message: string }>): ConfirmOptions {
  return { message: batchResultText(action, done, failures), confirmLabel: pick(M).ok }
}

/** After the action: `已发送给 3 个` / `已发送给 2 个，1 个没发出去：修复登录（终端里有确认框…）`. */
export function batchResultText(action: BatchAction, done: number, failures: ReadonlyArray<{ title: string; message: string }>): string {
  const m = pick(M)
  const head = m.result(action, done)
  if (failures.length === 0) return head
  return m.failed(head, action, failures)
}

/** ⇧-click: the ids between the anchor and the clicked one, in drawn order (just the clicked one without an anchor). */
export function rangeBetween(ordered: readonly SessionId[], anchor: SessionId | null, target: SessionId): SessionId[] {
  const to = ordered.indexOf(target)
  const from = anchor === null ? -1 : ordered.indexOf(anchor)
  if (to === -1) return []
  if (from === -1) return [target]
  return ordered.slice(Math.min(from, to), Math.max(from, to) + 1)
}

/** ⌘-click: toggles one id in the picked set, keeping the drawn order stable for display. */
export function togglePicked(picked: readonly SessionId[], id: SessionId): SessionId[] {
  return picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]
}
