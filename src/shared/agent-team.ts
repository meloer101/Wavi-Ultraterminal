// Claude Code agent teams in a terminal session (PRD F21 · agent teams, Figma 83″B): who is in the lead's team, when
// each of them worked, and who sent whom what — enough to draw one lane per member over time. Display only: Wavi never
// talks to a teammate. Main turns the lead's hooks into TeamHooks (main/hooks/teams.ts); this file is the pure rules,
// shared so the renderer and the tests read the same state. Measured on 2.1.325 (PRD §6.20 agent teams): a teammate
// sends SubagentStart for each message it takes up and SubagentStop + TeammateIdle when that turn ends, so a stop is
// "idle", never "gone"; only a new or ended conversation dissolves the team.

/** The lead's own lane: the session's main thread. */
export const TEAM_LEAD = 'lead'
/** What a teammate calls the lead in SendMessage. */
const LEAD_ALIASES = new Set(['lead', 'team-lead'])
/** How far back lanes and messages are kept: the strip's time axis spans at most this (Figma 83″B). */
export const TEAM_WINDOW_MS = 30 * 60_000
/** Messages kept, newest last. */
export const TEAM_MESSAGES = 50
/** A message's text is cut to this many characters. */
export const TEAM_MESSAGE_CHARS = 200

export type TeamMemberState = 'working' | 'idle' | 'asking'

/** A stretch of one member's lane: working, or waiting on the user's answer. Open (`to` absent) while it lasts. */
export interface TeamSpan {
  from: number
  to?: number
  kind: 'working' | 'asking'
}

export interface TeamMember {
  /** The teammate's name (`coder`), or TEAM_LEAD. */
  name: string
  /** Claude's `agent_id` (`acoder-3cf0…`); '' for the lead. */
  agentId: string
  /** Display name of its model (`Sonnet 5.5`); the lead's is the session's own, absent here. */
  model?: string
  state: TeamMemberState
  /** What it is doing now (current-action wording); absent while idle. */
  action?: string
  spans: TeamSpan[]
}

export interface TeamMessage {
  /** A member's name or TEAM_LEAD. */
  from: string
  to: string
  text: string
  at: number
}

export interface TeamState {
  /** When the first teammate joined. */
  startedAt: number
  /** The lead first, then teammates in the order they joined. */
  members: TeamMember[]
  messages: TeamMessage[]
}

/** What one hook says about the team, parsed by main from Claude's payloads. */
export type TeamHook =
  /** A new, cleared or resumed conversation, or the agent quit: the team is gone. */
  | { kind: 'reset' }
  /** `Agent` PostToolUse with `status: teammate_spawned`. */
  | { kind: 'spawned'; name: string; agentId: string; model?: string }
  /** SubagentStart: a teammate took up a message. */
  | { kind: 'start'; agentId: string }
  /** SubagentStop / TeammateIdle: its turn ended. */
  | { kind: 'idle'; agentId: string }
  /** PermissionRequest from a teammate: answered in the lead's TUI. */
  | { kind: 'asking'; agentId: string }
  /** A tool call of a teammate's, or of the lead's when `agentId` is ''. */
  | { kind: 'action'; agentId: string; action: string }
  /** The lead's turn started (UserPromptSubmit) or ended (Stop). */
  | { kind: 'lead'; working: boolean }
  /** SendMessage: `fromAgentId` '' is the lead. */
  | { kind: 'message'; fromAgentId: string; to: string; text: string }

const sameName = (a: string, b: string): boolean => a === b || (LEAD_ALIASES.has(a) && LEAD_ALIASES.has(b))

function closeOpen(spans: readonly TeamSpan[], at: number): TeamSpan[] {
  const last = spans[spans.length - 1]
  return last && last.to === undefined ? [...spans.slice(0, -1), { ...last, to: Math.max(last.from, at) }] : [...spans]
}

/** Moves a member to `state`, closing the lane's open stretch and opening the new one's. */
function moveTo(member: TeamMember, state: TeamMemberState, at: number, action?: string): TeamMember {
  if (member.state === state) return action === undefined || action === member.action ? member : { ...member, action }
  const spans = closeOpen(member.spans, at)
  if (state !== 'idle') spans.push({ from: at, kind: state })
  const next: TeamMember = { ...member, state, spans }
  if (state === 'idle') delete next.action
  else if (action !== undefined) next.action = action
  return next
}

/** Drops what fell out of the window; an open stretch always stays. */
function prune(team: TeamState, at: number): TeamState {
  const since = at - TEAM_WINDOW_MS
  const members = team.members.map((m) => {
    const spans = m.spans.filter((s) => s.to === undefined || s.to >= since)
    return spans.length === m.spans.length ? m : { ...m, spans }
  })
  const kept = team.messages.filter((msg) => msg.at >= since)
  const messages = kept.length > TEAM_MESSAGES ? kept.slice(-TEAM_MESSAGES) : kept
  return { ...team, members, messages }
}

const lead = (): TeamMember => ({ name: TEAM_LEAD, agentId: '', state: 'idle', spans: [] })

/**
 * The team after one hook, or the same object when nothing changed. No team (null) until a teammate is spawned;
 * hooks about agents that are not teammates (plain subagents) change nothing.
 */
export function reduceTeam(team: TeamState | null, hook: TeamHook, at: number): TeamState | null {
  if (hook.kind === 'reset') return null
  if (hook.kind === 'spawned') {
    const base = team ?? { startedAt: at, members: [lead()], messages: [] }
    if (base.members.some((m) => m.agentId === hook.agentId)) return team
    const member: TeamMember = { name: hook.name, agentId: hook.agentId, ...(hook.model ? { model: hook.model } : {}), state: 'idle', spans: [] }
    return { ...base, members: [...base.members, member] }
  }
  if (!team) return null
  const update = (agentId: string, change: (m: TeamMember) => TeamMember): TeamState => {
    let changed = false
    const members = team.members.map((m) => {
      if (m.agentId !== agentId) return m
      const next = change(m)
      changed ||= next !== m
      return next
    })
    return changed ? prune({ ...team, members }, at) : team
  }
  switch (hook.kind) {
    case 'start':
      return update(hook.agentId, (m) => moveTo(m, 'working', at))
    case 'idle':
      return update(hook.agentId, (m) => moveTo(m, 'idle', at))
    case 'asking':
      return update(hook.agentId, (m) => moveTo(m, 'asking', at))
    case 'action':
      // A tool call after an answered ask means the member is back at work.
      return update(hook.agentId, (m) => moveTo(m, 'working', at, hook.action))
    case 'lead':
      return update('', (m) => moveTo(m, hook.working ? 'working' : 'idle', at))
    case 'message': {
      const from = hook.fromAgentId ? team.members.find((m) => m.agentId === hook.fromAgentId)?.name : TEAM_LEAD
      const to = team.members.find((m) => sameName(m.name, hook.to))?.name
      if (!from || !to) return team
      const text = hook.text.length > TEAM_MESSAGE_CHARS ? `${hook.text.slice(0, TEAM_MESSAGE_CHARS - 1)}…` : hook.text
      return prune({ ...team, messages: [...team.messages, { from, to, text, at }] }, at)
    }
  }
}

/** Whether an `agent_id` is one of the team's teammates (their hooks are not a plain subagent's). */
export const isTeammate = (team: TeamState | null, agentId: string): boolean => !!agentId && !!team?.members.some((m) => m.agentId === agentId)

/** Per state, how many teammates are in it (the strip's header, Figma 83′C); the lead is not counted. */
export function teamCounts(team: TeamState): Record<TeamMemberState, number> {
  const counts: Record<TeamMemberState, number> = { working: 0, asking: 0, idle: 0 }
  for (const m of team.members) if (m.agentId) counts[m.state] += 1
  return counts
}
