import { describe, expect, it, vi } from 'vitest'
import { emptyGuiState } from '@shared/gui-chat'

vi.mock('../state/workspace', () => ({ useWorkspace: { getState: () => ({ sessions: [] }), subscribe: () => () => {} } }))
vi.mock('../state/persistence', () => ({ drafts: { get: () => '', set: () => undefined } }))
vi.mock('../lifecycle/launch-issues', () => ({ reportLaunchIssue: () => undefined }))

const { forgetGuiSessions, setGuiState, setMessageExpanded, useGuiSessions } = await import('./store')

describe('forgetGuiSessions', () => {
  it('returns every closed GUI session, also one never opened in this app run (its process may still run)', () => {
    // After a restart: g1 was opened (it has state), g2 was not (not-started; the daemon may still run its agent).
    setGuiState('g1', emptyGuiState())
    const all = [{ id: 'g1', ui: 'gui' as const }, { id: 'g2', ui: 'gui' as const }, { id: 't1' }]
    expect(forgetGuiSessions(all)).toEqual([])
    expect(forgetGuiSessions([{ id: 'g1', ui: 'gui' }, { id: 't1' }])).toEqual(['g2'])
    expect(forgetGuiSessions([{ id: 't1' }])).toEqual(['g1'])
    expect(useGuiSessions.getState().states).toEqual({})
    // A terminal session that closes is not a GUI session to stop.
    expect(forgetGuiSessions([])).toEqual([])
  })
})

describe('setMessageExpanded (Figma 96A)', () => {
  it('keeps the long messages you opened, per session, until the session closes', () => {
    setGuiState('g3', emptyGuiState())
    forgetGuiSessions([{ id: 'g3', ui: 'gui' }])
    setMessageExpanded('g3', 'm1', true)
    setMessageExpanded('g3', 'm2', true)
    setMessageExpanded('g3', 'm1', false)
    expect([...(useGuiSessions.getState().expanded['g3'] ?? [])]).toEqual(['m2'])
    forgetGuiSessions([])
    expect(useGuiSessions.getState().expanded['g3']).toBeUndefined()
  })
})
