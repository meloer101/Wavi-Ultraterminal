import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentEventEnvelope } from '@shared/agent-events'
import type { Session } from '@shared/types'
import { forgetTyping, noteInput, noteUserLine } from '../terminal/typing'
import { leaderTurnQuiet, queueReport, startReports } from './reports'
import { setWoken, useDispatch } from './store'

let sessions: Session[] = []
let leaderSessions: Record<string, string> = {}

vi.mock('../state/workspace', () => ({
  useWorkspace: {
    getState: () => ({
      sessions,
      worktrees: [{ id: 'w1', projectId: 'p1', path: '/repo', isMain: true, branch: 'main' }],
      projects: [{ id: 'p1', rootPath: '/repo', name: 'repo' }],
      leaderSessions
    }),
    subscribe: () => () => {}
  }
}))
vi.mock('../state/attempt-groups', () => ({ useAttemptGroups: { getState: () => ({ groups: [] }) } }))
vi.mock('../session-io', () => ({ submitPrompt: async () => {} }))
vi.mock('../session-meta/store', () => ({ useSessionMeta: { getState: () => ({ bySession: {} }) } }))
vi.mock('../conflict-radar/store', () => ({ markFor: () => null, useRadar: { getState: () => ({ byRoot: {} }) } }))

const session = (id: string, over: Partial<Session> = {}): Session => ({ id, worktreeId: 'w1', kind: 'claude', title: id, status: 'running', startedAt: 1, lastActivityAt: 1, ...over })

describe('a leader’s turn that a report woke (PRD F21 v1.198 · 交给用户)', () => {
  beforeEach(() => {
    leaderSessions = { p1: 'lead' }
    forgetTyping('lead')
    useDispatch.setState({ woken: {}, messages: {} })
  })

  it('ends quietly once, when it began after the report went in and the user said nothing since', () => {
    sessions = [session('lead', { turnStartedAt: 2_000 })]
    setWoken('lead', 1_500)
    expect(leaderTurnQuiet('lead')).toBe(true)
    // Used up: the next turn is the user's or another report's.
    expect(leaderTurnQuiet('lead')).toBe(false)
  })

  it('is the user’s when they sent a line since, or when the turn began before the report', () => {
    sessions = [session('lead', { turnStartedAt: 2_000 })]
    setWoken('lead', 1_500)
    noteInput('lead', 'and also this\r', 1_800)
    expect(leaderTurnQuiet('lead')).toBe(false)
    setWoken('lead', 2_500)
    expect(leaderTurnQuiet('lead')).toBe(false)
  })

  it('is the user’s when they sent a line from the phone or 总览 since a report left it unused', () => {
    // A report went in while the user's own turn ran: that turn began first, so it was not quiet, and woken stays.
    sessions = [session('lead', { turnStartedAt: 1_000 })]
    setWoken('lead', 1_500)
    expect(leaderTurnQuiet('lead')).toBe(false)
    noteUserLine('lead', 3_000)
    sessions = [session('lead', { turnStartedAt: 3_100 })]
    expect(leaderTurnQuiet('lead')).toBe(false)
  })

  it('is never quiet for a session that is not a leader', () => {
    leaderSessions = {}
    sessions = [session('lead', { turnStartedAt: 2_000 })]
    setWoken('lead', 1_500)
    expect(leaderTurnQuiet('lead')).toBe(false)
  })
})

describe('last messages (PRD F21 v1.198 · 看)', () => {
  let emit: ((envelope: AgentEventEnvelope) => void) | null = null
  beforeEach(() => {
    vi.stubGlobal('window', { setTimeout, clearTimeout, tr: { agent: { onEvent: (listener: (e: AgentEventEnvelope) => void) => ((emit = listener), () => {}) } } })
    useDispatch.setState({ messages: {} })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps every session’s whole last message in a project with a leader, only children’s elsewhere', () => {
    sessions = [session('lead'), session('user1')]
    leaderSessions = { p1: 'lead' }
    const stop = startReports()
    emit!({ sessionId: 'user1', event: { type: 'stop', message: 'All of it' } } as AgentEventEnvelope)
    expect(useDispatch.getState().messages.user1).toBe('All of it')
    leaderSessions = {}
    emit!({ sessionId: 'user1', event: { type: 'stop', message: 'Not kept' } } as AgentEventEnvelope)
    expect(useDispatch.getState().messages.user1).toBe('All of it')
    stop()
  })
})

describe('when a report woke a leader (PRD F21 v1.198 · 交给用户)', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('is taken before the report goes in, so the turn it starts while delivery returns still counts as woken', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    leaderSessions = { p1: 'lead' }
    sessions = [session('lead', { status: 'idle' }), session('kid', { dispatchedBy: 'lead', dispatchTask: 'x' })]
    useDispatch.setState({ woken: {}, messages: {}, held: {} })
    useDispatch.setState({ queues: {} })
    let sentAt: number | null = null
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
      tr: {
        git: { changes: async () => null },
        dispatch: {
          deliver: async () => {
            sentAt = Date.now()
            // The leader's turn starts (and its hook arrives) before main answers.
            vi.setSystemTime(Date.now() + 400)
            return 'delivered'
          }
        }
      }
    })
    queueReport(sessions[1]!, 'report', 'Done: x')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(sentAt).not.toBeNull()
    expect(useDispatch.getState().woken.lead).toBeLessThanOrEqual(sentAt!)
    sessions = [session('lead', { turnStartedAt: sentAt! + 200 })]
    expect(leaderTurnQuiet('lead')).toBe(true)
  })
})
