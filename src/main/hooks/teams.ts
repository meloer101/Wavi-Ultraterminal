// Claude Code agent teams in a terminal session (PRD F21 · agent teams, Figma 83″B): follows the lead's hooks and
// reports the team — its members, when each worked, who sent whom what — whenever it changes. Nothing is read from
// disk: the hooks carry it all (measured on 2.1.325, PRD §6.20). The rules are shared/agent-team.ts; this file only
// turns Claude's payloads into TeamHooks, so a change in Claude's payload shapes is fixed here alone. GUI sessions
// (claude -p) never spawn teammates.
import type { HookAgent } from '@shared/agent-events'
import { isTeammate, reduceTeam, type TeamHook, type TeamState } from '@shared/agent-team'
import { currentAction } from '@shared/current-action'
import { claudeModelLabel, subagentIdOf } from './subagents'

type Rec = Record<string, unknown>
const isRec = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined)

/** What one of the lead's hooks says about its team; [] when nothing. */
export function teamHooksOf(event: string, payload: Rec): TeamHook[] {
  const agentId = subagentIdOf(payload) ?? ''
  const tool = str(payload.tool_name)
  const input = isRec(payload.tool_input) ? payload.tool_input : {}
  switch (event) {
    case 'SessionStart':
    case 'SessionEnd':
      return [{ kind: 'reset' }]
    case 'UserPromptSubmit':
      return agentId ? [] : [{ kind: 'lead', working: true }]
    case 'Stop':
      return [{ kind: 'lead', working: false }]
    case 'SubagentStart':
      return agentId ? [{ kind: 'start', agentId }] : []
    case 'SubagentStop':
    case 'TeammateIdle':
      return agentId ? [{ kind: 'idle', agentId }] : []
    case 'PermissionRequest':
      return agentId ? [{ kind: 'asking', agentId }] : []
    case 'PreToolUse': {
      if (!tool) return []
      if (tool === 'SendMessage') {
        const to = str(input.to) ?? str(input.recipient)
        // A protocol message (shutdown_request, …) is an object: its summary says what it is.
        const text = str(input.message) ?? str(input.summary)
        return to && text ? [{ kind: 'message', fromAgentId: agentId, to, text }] : []
      }
      return [{ kind: 'action', agentId, action: currentAction(tool, input) }]
    }
    case 'PostToolUse': {
      const response = payload.tool_response
      if (tool === 'Agent' && isRec(response) && response.status === 'teammate_spawned') {
        const name = str(response.name) ?? str(input.name)
        const id = str(response.agent_id) ?? str(response.agentId)
        const model = claudeModelLabel(response.resolvedModel ?? response.model)
        return name && id ? [{ kind: 'spawned', name, agentId: id, ...(model ? { model } : {}) }] : []
      }
      // A teammate's call finishing after its ask was answered: back at work.
      return agentId && tool ? [{ kind: 'action', agentId, action: currentAction(tool, input) }] : []
    }
    default:
      return []
  }
}

/**
 * Follows Claude's hooks per session and reports its team (null once it is gone). Electron-free: the glue supplies
 * `emit` and each hook's time.
 */
/** Starts of agents not (yet) known as teammates kept per session: plain subagents' too, so a few only. */
const EARLY_STARTS = 16

export class TeamWatcher {
  private readonly teams = new Map<string, TeamState | null>()
  /**
   * A teammate's first SubagentStart can come just before the `teammate_spawned` PostToolUse that names it (1 ms
   * apart, 2.1.325): held here by agent id, and applied once the spawn arrives.
   */
  private readonly early = new Map<string, Map<string, number>>()

  constructor(private readonly emit: (sessionId: string, agent: HookAgent, team: TeamState | null) => void) {}

  /** One hook call for an attached session; `at` is when it fired. */
  observe(sessionId: string, agent: HookAgent, event: string, payload: unknown, at: number): void {
    if (agent !== 'claude' || !isRec(payload)) return
    // A workflow's agents are the run's (workflows.ts), never teammates.
    if (payload.agent_type === 'workflow-subagent') return
    const before = this.teams.get(sessionId) ?? null
    let team = before
    for (const hook of teamHooksOf(event, payload)) {
      if (hook.kind === 'reset') this.early.delete(sessionId)
      if (hook.kind === 'start' && !isTeammate(team, hook.agentId)) {
        this.holdStart(sessionId, hook.agentId, at)
        continue
      }
      if (hook.kind === 'idle') this.early.get(sessionId)?.delete(hook.agentId)
      team = reduceTeam(team, hook, at)
      const held = hook.kind === 'spawned' ? this.early.get(sessionId)?.get(hook.agentId) : undefined
      if (hook.kind === 'spawned' && held !== undefined) {
        this.early.get(sessionId)?.delete(hook.agentId)
        team = reduceTeam(team, { kind: 'start', agentId: hook.agentId }, held)
      }
    }
    if (team === before) return
    this.teams.set(sessionId, team)
    this.emit(sessionId, agent, team)
  }

  /** The session's PTY ended or was re-spawned: stop following it. */
  forget(sessionId: string): void {
    this.teams.delete(sessionId)
    this.early.delete(sessionId)
  }

  private holdStart(sessionId: string, agentId: string, at: number): void {
    let held = this.early.get(sessionId)
    if (!held) this.early.set(sessionId, (held = new Map()))
    held.delete(agentId)
    held.set(agentId, at)
    // Oldest first: a Map keeps insertion order.
    for (const id of held.keys()) {
      if (held.size <= EARLY_STARTS) break
      held.delete(id)
    }
  }
}
