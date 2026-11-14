import { describe, expect, it } from 'vitest'
import type { TeamState } from '@shared/agent-team'
import { claudeTeamRun } from './fixtures'
import { teamHooksOf, TeamWatcher } from './teams'

function watch() {
  const sent: (TeamState | null)[] = []
  const watcher = new TeamWatcher((_id, _agent, team) => sent.push(team))
  return { watcher, sent }
}

describe('TeamWatcher (agent teams, PRD §6.20)', () => {
  it('follows a measured run: two teammates join, work in turns and pass messages; the team ends with the session', () => {
    const { watcher, sent } = watch()
    // Everything up to the last Stop; SessionEnd comes after.
    const run = claudeTeamRun.slice(0, -1)
    for (const [at, event, payload] of run) watcher.observe('s1', 'claude', event, payload, at)
    const team = sent.at(-1)!
    expect(team.members.map((m) => `${m.name}:${m.model ?? '-'}:${m.state}`)).toEqual(['lead:-:idle', 'reviewer:Haiku 5.5:idle', 'coder:Haiku 5.5:idle'])
    expect(team.messages.map((m) => `${m.from}>${m.to}:${m.text}`)).toEqual([
      'coder>reviewer:v1 ready',
      'reviewer>coder:needs fix',
      'coder>reviewer:v2 ready',
      'reviewer>coder:approved'
    ])
    // The lead is mid-turn when its team forms (the spawn is its call), then runs a turn for a teammate's idle notice
    // (its Stop ends it) with no UserPromptSubmit; a notice that comes while it is still at work joins that turn.
    expect(team.members[0]!.spans.map((s) => `${s.from}-${s.to}`)).toEqual(['23535-28521', '34783-37316', '41132-43077', '43170-45328', '47233-49763'])
    // Each message taken up is one working stretch: reviewer read v1, v2; coder started, read "needs fix", "approved".
    expect(team.members.find((m) => m.name === 'reviewer')!.spans).toHaveLength(3)
    expect(team.members.find((m) => m.name === 'coder')!.spans.every((s) => s.to !== undefined && s.kind === 'working')).toBe(true)
    const [, end, payload] = claudeTeamRun.at(-1)!
    watcher.observe('s1', 'claude', end, payload, 200_000)
    expect(sent.at(-1)).toBeNull()
  })

  it('sends only changes, and nothing for a session without a team or for other agents', () => {
    const { watcher, sent } = watch()
    watcher.observe('s1', 'claude', 'SessionStart', {}, 0)
    watcher.observe('s1', 'claude', 'PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } }, 1)
    watcher.observe('s1', 'codex', 'PostToolUse', { tool_name: 'Agent', tool_response: { status: 'teammate_spawned', name: 'x', agent_id: 'ax-1' } }, 2)
    expect(sent).toEqual([])
    watcher.observe('s1', 'claude', 'PostToolUse', { tool_name: 'Agent', tool_response: { status: 'teammate_spawned', name: 'x', agent_id: 'ax-1' } }, 3)
    watcher.observe('s1', 'claude', 'SubagentStop', { agent_id: 'ax-1' }, 4)
    expect(sent).toHaveLength(1)
  })

  it('reads a protocol message by its summary, and a teammate’s tool call as what it is doing', () => {
    expect(teamHooksOf('PreToolUse', { agent_id: 'ax-1', tool_name: 'SendMessage', tool_input: { to: 'lead', message: { type: 'shutdown_request' }, summary: '收尾' } })).toEqual([
      { kind: 'message', fromAgentId: 'ax-1', to: 'lead', text: '收尾' }
    ])
    expect(teamHooksOf('PreToolUse', { agent_id: 'ax-1', tool_name: 'Read', tool_input: { file_path: '/r/src/pay/refund.ts' } })[0]).toMatchObject({ kind: 'action', agentId: 'ax-1' })
    expect(teamHooksOf('Notification', {})).toEqual([])
  })
})
