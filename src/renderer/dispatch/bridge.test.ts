import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { noteInput } from '../terminal/typing'
import { startDispatchBridge } from './bridge'
import { setTell, useDispatch } from './store'

vi.mock('./handler', () => ({ handleWaviRequest: async () => ({ ok: true, text: '' }), resumeConfirmTimers: () => {}, setDispatchSettings: () => {} }))
vi.mock('./reports', () => ({ resumeReports: () => {}, startReports: () => () => {} }))
vi.mock('../attempts/report', () => ({ startAttemptReports: () => () => {} }))
vi.mock('../state/persistence', () => ({ addSnapshotPart: () => () => {}, initialWorkspaceFile: () => null, requestSave: () => {} }))

describe('a leader’s wavi tell (PRD F21 v1.177 · 交给用户)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('stays until the user sends a line in the leader’s terminal, not another one’s', () => {
    vi.stubGlobal('window', {
      tr: {
        settings: { get: async () => DEFAULT_SETTINGS, onChange: () => () => {} },
        dispatch: { onRequest: () => () => {}, reply: () => {} }
      }
    })
    const stop = startDispatchBridge()
    try {
      setTell('lead', 'Merge A or B first?')
      noteInput('other', 'hello\r')
      noteInput('lead', '\r')
      expect(useDispatch.getState().tells.lead).toBe('Merge A or B first?')
      noteInput('lead', 'A first\r')
      expect(useDispatch.getState().tells.lead).toBeUndefined()
    } finally {
      stop()
    }
  })
})
