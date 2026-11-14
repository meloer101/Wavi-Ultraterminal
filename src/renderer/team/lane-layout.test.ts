import { describe, expect, it } from 'vitest'
import type { TeamState } from '@shared/agent-team'
import { laneLayout, MIN_SPAN_MS } from './lane-layout'

const min = 60_000

function team(): TeamState {
  return {
    startedAt: 0,
    members: [
      { name: 'lead', agentId: '', state: 'idle', spans: [{ from: 0, to: 0.2 * min, kind: 'working' }] },
      { name: 'coder', agentId: 'acoder', state: 'idle', spans: [{ from: 0.2 * min, to: 4 * min, kind: 'working' }] },
      { name: 'reviewer', agentId: 'areviewer', state: 'working', spans: [{ from: 8 * min, kind: 'working' }] },
      { name: 'docs', agentId: 'adocs', state: 'asking', spans: [{ from: 9 * min, kind: 'asking' }] }
    ],
    messages: [
      { from: 'lead', to: 'docs', text: '补文档', at: 0.1 * min },
      { from: 'coder', to: 'reviewer', text: '第 1 版好了', at: 4 * min },
      { from: 'reviewer', to: 'coder', text: '退回', at: 6 * min },
      { from: 'coder', to: 'reviewer', text: '第 2 版好了', at: 8 * min }
    ]
  }
}

describe('laneLayout (Figma 83″B)', () => {
  it('maps time to the axis, now at the right edge; open stretches run to now in their status, ended ones are done', () => {
    const { bars, ticks } = laneLayout(team(), 10 * min)
    expect(bars.find((b) => b.lane === 1)).toMatchObject({ left: 2, width: 38, kind: 'done' })
    expect(bars.find((b) => b.lane === 2)).toMatchObject({ left: 80, width: 20, kind: 'working' })
    expect(bars.find((b) => b.lane === 3)).toMatchObject({ kind: 'asking' })
    expect(ticks.map((t) => t.label)).toEqual(['10m 前', '5m 前', '现在'])
  })

  it('draws a message from the sender’s lane to the receiver’s, its label in the gap before the head, up to the next arrow', () => {
    const { arrows } = laneLayout(team(), 10 * min)
    expect(arrows.map((a) => `${a.from}>${a.to} gap${a.gap} @${a.x} room${a.room}${a.latest ? ' latest' : ''}`)).toEqual([
      // lead → docs crosses no later arrow's gaps: its label may run to the edge.
      '0>3 gap2 @1 room99',
      '1>2 gap1 @40 room20',
      '2>1 gap1 @60 room20',
      '1>2 gap1 @80 room20 latest'
    ])
  })

  it('never spans less than two minutes, and keeps a stretch too short to see visible', () => {
    const fresh: TeamState = { startedAt: 0, members: [{ name: 'lead', agentId: '', state: 'idle', spans: [{ from: 0, to: 10, kind: 'working' }] }], messages: [] }
    const { bars, ticks } = laneLayout(fresh, 1000)
    expect(ticks[0]!.label).toBe(`${MIN_SPAN_MS / min}m 前`)
    expect(bars[0]!.width).toBeGreaterThanOrEqual(0.4)
  })
})
