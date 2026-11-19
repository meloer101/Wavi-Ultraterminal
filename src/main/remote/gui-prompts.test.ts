// A GUI session's prompts on the phone (PRD F22 v1.220 ①): what the driver asks becomes the phone's RemotePrompt, and
// the phone's answer becomes the GuiAnswer the desktop card would send.
import { describe, expect, it } from 'vitest'
import type { GuiPrompt } from '@shared/gui-chat'
import { GuiPrompts, optionFor, planAnswer, questionAnswer, remotePromptOf } from './gui-prompts'

const AT = 1_730_000_000_000

const permission: GuiPrompt = {
  kind: 'permission',
  id: 'req-1',
  tool: 'Bash',
  detail: 'pnpm vitest run server/auth',
  options: [
    { id: 'reject_once', label: '拒绝', kind: 'reject_once' },
    { id: 'allow_always', label: '总是允许', kind: 'allow_always' },
    { id: 'allow_once', label: '允许', kind: 'allow_once' }
  ]
}

/** An ACP agent's request: it offers no "always" (and no option of some kinds at all). */
const permissive: GuiPrompt = {
  kind: 'permission',
  id: 'req-2',
  tool: 'Edit',
  detail: 'src/auth.ts',
  options: [
    { id: 'yes', label: 'Allow', kind: 'allow_once' },
    { id: 'no', label: 'Reject', kind: 'reject_once' }
  ]
}

const question: GuiPrompt = {
  kind: 'question',
  id: 'req-q',
  questions: [
    { header: '数据库', question: '用哪个数据库', multiSelect: false, options: [{ label: 'Postgres' }, { label: 'SQLite' }] },
    { question: '要哪些检查', multiSelect: true, options: [{ label: 'lint' }, { label: 'test' }] }
  ]
}

const plan: GuiPrompt = { kind: 'plan', id: 'req-plan', plan: '先改登录，再改刷新' }

describe('remotePromptOf', () => {
  it('puts a permission request in the phone’s shape: the tool, its detail as the summary, the input the card reads', () => {
    expect(remotePromptOf(permission, 's1', AT)).toEqual({
      kind: 'permission',
      id: 'req-1',
      sessionId: 's1',
      tool: 'Bash',
      input: { command: 'pnpm vitest run server/auth' },
      summary: 'pnpm vitest run server/auth',
      canAllowAlways: true,
      createdAt: AT,
      answerable: true
    })
    // A path goes where current-action.ts looks for it (status.ts toolInputOf), and no 总是允许 without the option.
    expect(remotePromptOf(permissive, 's1', AT)).toMatchObject({ input: { file_path: 'src/auth.ts' }, canAllowAlways: false })
  })

  it('puts a question in the phone’s shape, keyed by the question text the phone answers with', () => {
    expect(remotePromptOf(question, 's1', AT)).toEqual({ kind: 'question', id: 'req-q', sessionId: 's1', questions: question.questions, createdAt: AT, answerable: true })
  })

  it('puts a GUI plan in the phone’s shape: its Markdown, answered with the plan command', () => {
    expect(remotePromptOf(plan, 's1', AT)).toEqual({ kind: 'plan', id: 'req-plan', sessionId: 's1', plan: '先改登录，再改刷新', createdAt: AT, answerable: true })
  })
})

describe('optionFor', () => {
  it('picks the option of the phone button’s kind', () => {
    expect(optionFor(permission, 'allow-once')).toBe('allow_once')
    expect(optionFor(permission, 'allow-always')).toBe('allow_always')
    expect(optionFor(permission, 'deny')).toBe('reject_once')
  })

  it('finds none when the agent offered none of that kind: the ask stays unanswered', () => {
    expect(optionFor(permissive, 'allow-always')).toBeNull()
    expect(optionFor(question, 'allow-once')).toBeNull()
    expect(optionFor(plan, 'deny')).toBeNull()
  })
})

describe('questionAnswer', () => {
  it('takes the answers whose keys are the open questions (the phone sends the question text)', () => {
    expect(questionAnswer(question, { 用哪个数据库: 'Postgres' })).toEqual({ kind: 'question', id: 'req-q', answers: { 用哪个数据库: 'Postgres' } })
    expect(questionAnswer(question, { 用哪个数据库: 'Postgres', 不存在的题: 'x' })).toEqual({ kind: 'question', id: 'req-q', answers: { 用哪个数据库: 'Postgres' } })
  })

  it('refuses an answer that names no open question, and a prompt that asks nothing', () => {
    expect(questionAnswer(question, { 用哪个数据库呢: 'Postgres' })).toBeNull()
    expect(questionAnswer(permission, { Bash: 'allow' })).toBeNull()
  })
})

describe('planAnswer', () => {
  it('answers a plan with the phone’s button, and carries the reason only when it keeps planning', () => {
    expect(planAnswer(plan, 'approve-auto')).toEqual({ kind: 'plan', id: 'req-plan', decision: 'approve-auto' })
    expect(planAnswer(plan, 'approve-ask', 'ignored')).toEqual({ kind: 'plan', id: 'req-plan', decision: 'approve-ask' })
    expect(planAnswer(plan, 'keep-planning', '先把测试补上')).toEqual({ kind: 'plan', id: 'req-plan', decision: 'keep-planning', message: '先把测试补上' })
    expect(planAnswer(plan, 'keep-planning')).toEqual({ kind: 'plan', id: 'req-plan', decision: 'keep-planning' })
  })

  it('refuses a prompt that is not a plan', () => {
    expect(planAnswer(permission, 'approve-auto')).toBeNull()
    expect(planAnswer(question, 'approve-ask')).toBeNull()
  })
})

describe('GuiPrompts', () => {
  const known = () => true

  it('keeps each session’s whole set, replacing it on every change', () => {
    const list = new GuiPrompts()
    list.set('s1', [permission], AT)
    list.set('s2', [question], AT + 1)
    expect(list.list(known).map((p) => p.id)).toEqual(['req-1', 'req-q'])
    expect(list.get('req-1')).toEqual({ sessionId: 's1', prompt: permission })
    // Both open at once (an agent may ask twice), then one is answered.
    list.set('s1', [permission, { ...question, id: 'req-q2' }], AT + 2)
    expect(list.list(known).map((p) => p.id)).toEqual(['req-1', 'req-q', 'req-q2'])
    list.set('s1', [{ ...question, id: 'req-q2' }], AT + 3)
    expect(list.list(known).map((p) => p.id)).toEqual(['req-q', 'req-q2'])
    expect(list.get('req-1')).toBeNull()
    expect(list.list(known).find((p) => p.id === 'req-q2')?.createdAt).toBe(AT + 2)
  })

  it('drops a session’s prompts when it changes or ends, and follows what the phone still knows', () => {
    const list = new GuiPrompts()
    list.set('s1', [permission], AT)
    list.set('s1', [], AT + 1)
    expect(list.list(known)).toEqual([])
    expect(list.get('req-1')).toBeNull()
    list.set('s1', [permission], AT + 2)
    expect(list.list(() => false)).toEqual([])
    list.clear('s1')
    expect(list.get('req-1')).toBeNull()
    expect(list.list(known)).toEqual([])
  })

  it('lists the oldest ask first, whatever order the sessions reported in', () => {
    const list = new GuiPrompts()
    list.set('s2', [question], AT + 500)
    list.set('s1', [permission], AT)
    expect(list.list(known).map((p) => p.sessionId)).toEqual(['s1', 's2'])
  })
})
