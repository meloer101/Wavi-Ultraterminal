import { describe, expect, it } from 'vitest'
import { isTeammate, reduceTeam, TEAM_LEAD, TEAM_MESSAGES, TEAM_WINDOW_MS, teamCounts, type TeamHook, type TeamState } from './agent-team'

/** Replays hooks at the given times (ms). */
function replay(steps: ReadonlyArray<[number, TeamHook]>, from: TeamState | null = null): TeamState | null {
  return steps.reduce<TeamState | null>((team, [at, hook]) => reduceTeam(team, hook, at), from)
}

const spawn = (name: string, model?: string): TeamHook => ({ kind: 'spawned', name, agentId: `a${name}-1`, ...(model ? { model } : {}) })

describe('reduceTeam (agent teams, Figma 83″B)', () => {
  it('has no team until a teammate is spawned; then the lead and the teammates, in join order', () => {
    expect(reduceTeam(null, { kind: 'start', agentId: 'ax-1' }, 0)).toBeNull()
    const team = replay([
      [100, spawn('reviewer', 'Haiku 5.5')],
      [110, spawn('coder', 'Sonnet 5.5')],
      [120, spawn('coder')]
    ])
    expect(team?.startedAt).toBe(100)
    expect(team?.members.map((m) => `${m.name}:${m.model ?? '-'}:${m.state}`)).toEqual([`${TEAM_LEAD}:-:idle`, 'reviewer:Haiku 5.5:idle', 'coder:Sonnet 5.5:idle'])
  })

  // The measured order (PRD §6.20, 2.1.325): a teammate starts a turn per message it takes up and goes idle after it.
  it('draws each turn as a working stretch and a stop as idle, not gone', () => {
    const team = replay([
      [0, spawn('coder')],
      [1000, { kind: 'start', agentId: 'acoder-1' }],
      [1500, { kind: 'action', agentId: 'acoder-1', action: '编辑 refund.ts' }],
      [4000, { kind: 'idle', agentId: 'acoder-1' }],
      [4010, { kind: 'idle', agentId: 'acoder-1' }],
      [9000, { kind: 'start', agentId: 'acoder-1' }]
    ])
    const coder = team!.members[1]!
    expect(coder.state).toBe('working')
    expect(coder.spans).toEqual([
      { from: 1000, to: 4000, kind: 'working' },
      { from: 9000, kind: 'working' }
    ])
    expect(teamCounts(team!)).toEqual({ working: 1, asking: 0, idle: 0 })
  })

  it('marks an ask as its own stretch until the next tool call, and ignores hooks of plain subagents', () => {
    const team = replay([
      [0, spawn('docs')],
      [100, { kind: 'start', agentId: 'adocs-1' }],
      [200, { kind: 'asking', agentId: 'adocs-1' }],
      [250, { kind: 'start', agentId: 'aplain-9' }],
      [900, { kind: 'action', agentId: 'adocs-1', action: '写入 docs/pay.md' }]
    ])
    const docs = team!.members[1]!
    expect(docs.spans.map((s) => `${s.kind}:${s.from}-${s.to ?? 'now'}`)).toEqual(['working:100-200', 'asking:200-900', 'working:900-now'])
    expect(docs.action).toBe('写入 docs/pay.md')
    expect(isTeammate(team, 'adocs-1')).toBe(true)
    expect(isTeammate(team, 'aplain-9')).toBe(false)
  })

  it('records who sent whom what, the lead by its own name or team-lead, and drops messages to strangers', () => {
    const team = replay([
      [0, spawn('coder')],
      [1, spawn('reviewer')],
      [10, { kind: 'message', fromAgentId: '', to: 'coder', text: '按订单拆退款' }],
      [20, { kind: 'message', fromAgentId: 'acoder-1', to: 'reviewer', text: 'v1 ready' }],
      [30, { kind: 'message', fromAgentId: 'areviewer-1', to: 'team-lead', text: 'x'.repeat(500) }],
      [40, { kind: 'message', fromAgentId: 'acoder-1', to: 'nobody', text: 'lost' }]
    ])
    expect(team!.messages.map((m) => `${m.from}>${m.to}`)).toEqual(['lead>coder', 'coder>reviewer', 'reviewer>lead'])
    expect(team!.messages[2]!.text).toHaveLength(200)
  })

  it('keeps only the last 30 minutes and at most 50 messages, but never an open stretch', () => {
    const late = TEAM_WINDOW_MS + 60_000
    const steps: Array<[number, TeamHook]> = [
      [0, spawn('coder')],
      [10, { kind: 'start', agentId: 'acoder-1' }],
      [20, { kind: 'idle', agentId: 'acoder-1' }],
      [30, { kind: 'start', agentId: 'acoder-1' }]
    ]
    for (let i = 0; i < TEAM_MESSAGES + 5; i++) steps.push([late + i, { kind: 'message', fromAgentId: '', to: 'coder', text: String(i) }])
    const team = replay(steps)!
    expect(team.members[1]!.spans).toEqual([{ from: 30, kind: 'working' }])
    expect(team.messages).toHaveLength(TEAM_MESSAGES)
    expect(team.messages.at(-1)!.text).toBe(String(TEAM_MESSAGES + 4))
  })

  it('dissolves on a new or ended conversation, and returns the same object when nothing changed', () => {
    const team = replay([[0, spawn('coder')]])
    expect(reduceTeam(team, { kind: 'idle', agentId: 'acoder-1' }, 5)).toBe(team)
    expect(reduceTeam(team, { kind: 'reset' }, 5)).toBeNull()
  })
})
