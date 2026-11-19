// A GUI session's prompts as the phone gets them (PRD F22 v1.220 ①): the driver's `GuiPrompt` in the phone's shape,
// and the phone's answer back as the same `GuiAnswer` the desktop card sends. Unlike a terminal session's prompt, nothing
// is held for the phone: the GUI's own card and the phone are two views of one ask, so whichever answers first wins and
// the other's list drops it (`prompt-done`, broadcast as `prompts`). Pure: no Electron, no Node.
import type { GuiAnswer, GuiPermissionOption, GuiPrompt } from '@shared/gui-chat'
import { remotePromptId, REMOTE_LIMITS, type PhoneCommand, type RemotePrompt } from '@shared/remote'
import { toolInputOf } from '../gui/status'

/** 拒绝 / 总是允许 / 允许 on the phone → the option kind the agent offered (ACP's own kinds; Claude and Codex use them too). */
const OPTION_KIND: Readonly<Record<Extract<PhoneCommand, { type: 'permission' }>['decision'], GuiPermissionOption['kind']>> = {
  'allow-once': 'allow_once',
  'allow-always': 'allow_always',
  deny: 'reject_once'
}
export type PhoneDecision = keyof typeof OPTION_KIND

/** 继续规划 / 批准，编辑时问我 / 批准并自动接受编辑 (the desktop plan card's three buttons, PRD F22 v1.220 ①). */
export type PlanDecision = Extract<PhoneCommand, { type: 'plan' }>['decision']

/**
 * A GUI prompt in the phone's list. A permission request keeps its tool and detail (the phone's sheet shows them, and the
 * built input the way `current-action.ts` reads it, as status.ts's `promptCall` does); a question keeps its questions,
 * keyed by the question text the phone answers with; a plan its Markdown, which the phone's sheet (Figma 100) shows as
 * the Mac's plan card does. The `id` is `remotePromptId`: the driver's own is unique only inside its process.
 */
export function remotePromptOf(prompt: GuiPrompt, sessionId: string, createdAt: number): RemotePrompt {
  const id = remotePromptId(sessionId, prompt.id)
  if (prompt.kind === 'question') return { kind: 'question', id, sessionId, questions: prompt.questions, createdAt, answerable: true }
  if (prompt.kind === 'plan') return { kind: 'plan', id, sessionId, plan: prompt.plan, createdAt, answerable: true }
  return {
    kind: 'permission',
    id,
    sessionId,
    tool: prompt.tool,
    input: toolInputOf(prompt.tool, prompt.detail),
    summary: prompt.detail,
    canAllowAlways: prompt.options.some((o) => o.kind === 'allow_always'),
    createdAt,
    answerable: true
  }
}

/** The option the phone's button picks, or null when the agent offered none of that kind (the ask stays unanswered). */
export function optionFor(prompt: GuiPrompt, decision: PhoneDecision): string | null {
  if (prompt.kind !== 'permission') return null
  return prompt.options.find((o) => o.kind === OPTION_KIND[decision])?.id ?? null
}

/** How a question is matched against the phone's keys (whose length `parsePhoneRequest` bounds the same way); a question
 *  written with surrounding whitespace still matches. */
const questionKey = (text: string): string => text.trim().slice(0, REMOTE_LIMITS.answerChars)

/**
 * The phone's answers (question text → the chosen label) as a `GuiAnswer`: every open question must have one (the phone's
 * sheet sends them all), and the keys are compared trimmed, as a question written with surrounding whitespace still
 * matches. The answer goes back keyed by the question's own text. Every driver reads its answers by that text.
 */
export function questionAnswer(prompt: GuiPrompt, answers: Record<string, string>): GuiAnswer | null {
  if (prompt.kind !== 'question' || prompt.questions.length === 0) return null
  const known = new Map(prompt.questions.map((q) => [questionKey(q.question), q.question]))
  const kept: Record<string, string> = {}
  for (const [key, answer] of Object.entries(answers)) {
    const question = known.get(questionKey(key))
    if (question !== undefined) kept[question] = answer
  }
  return prompt.questions.every((q) => kept[q.question] !== undefined) ? { kind: 'question', id: prompt.id, answers: kept } : null
}

/** The phone's three plan buttons as a `GuiAnswer`; the message only travels with 继续规划 (the agent is told why). */
export function planAnswer(prompt: GuiPrompt, decision: PlanDecision, message?: string): GuiAnswer | null {
  if (prompt.kind !== 'plan') return null
  return { kind: 'plan', id: prompt.id, decision, ...(message && decision === 'keep-planning' ? { message } : {}) }
}

interface Open {
  prompt: GuiPrompt
  remote: RemotePrompt
}

/** What each GUI session waits on now, by session and by prompt id. */
export class GuiPrompts {
  private readonly sessions = new Map<string, Open[]>()
  private readonly byId = new Map<string, Open & { sessionId: string }>()

  /** The session's whole open set, each time it changes (`GuiHostDeps.prompts`); `at` dates a prompt seen first now. */
  set(sessionId: string, prompts: readonly GuiPrompt[], at: number): void {
    const before = new Map((this.sessions.get(sessionId) ?? []).map((open) => [open.prompt.id, open]))
    const next: Open[] = []
    for (const prompt of prompts) {
      // The same ask, seen again (another one joined or left): it keeps the moment the phone first saw it.
      const createdAt = before.get(prompt.id)?.remote.createdAt ?? at
      next.push({ prompt, remote: remotePromptOf(prompt, sessionId, createdAt) })
    }
    for (const open of before.values()) if (!next.some((o) => o.prompt.id === open.prompt.id)) this.byId.delete(open.remote.id)
    for (const open of next) this.byId.set(open.remote.id, { ...open, sessionId })
    if (next.length > 0) this.sessions.set(sessionId, next)
    else this.sessions.delete(sessionId)
  }

  /** The session ended: nothing waits on it. */
  clear(sessionId: string): void {
    for (const open of this.sessions.get(sessionId) ?? []) this.byId.delete(open.remote.id)
    this.sessions.delete(sessionId)
  }

  /** What the phone's prompt list gets, oldest first; `known` drops the sessions the phone no longer has. */
  list(known: (sessionId: string) => boolean): RemotePrompt[] {
    const out: RemotePrompt[] = []
    for (const [sessionId, opens] of this.sessions) if (known(sessionId)) for (const open of opens) out.push(open.remote)
    return out.sort((a, b) => a.createdAt - b.createdAt)
  }

  /** The prompt the phone names, while it is open. */
  get(id: string): { sessionId: string; prompt: GuiPrompt } | null {
    const open = this.byId.get(id)
    return open ? { sessionId: open.sessionId, prompt: open.prompt } : null
  }
}
