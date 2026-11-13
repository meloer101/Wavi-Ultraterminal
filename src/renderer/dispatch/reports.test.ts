import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentEventEnvelope } from '@shared/agent-events'
import type { Session } from '@shared/types'
import { forgetTyping, noteInput } from '../terminal/typing'
import { leaderTurnQuiet, startReports } from './reports'
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

describe('a leader’s turn that a report woke (PRD F21 v1.177 · 交给用户)', () => {
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

  it('is never quiet for a session that is not a leader', () => {
    leaderSessions = {}
    sessions = [session('lead', { turnStartedAt: 2_000 })]
    setWoken('lead', 1_500)
    expect(leaderTurnQuiet('lead')).toBe(false)
  })
})

describe('last messages (PRD F21 v1.177 · 看)', () => {
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
