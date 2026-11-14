// Where the team's lanes draw what (Figma 83″B): one lane per member, time left to right with now at the right edge.
// Positions are percentages of the time axis, so the strip lays them out at any width without measuring.
import { TEAM_WINDOW_MS, type TeamState } from '@shared/agent-team'

/** The axis never spans less than this, so a team that just formed is not drawn as a wall of bars. */
export const MIN_SPAN_MS = 2 * 60_000
/** A stretch shorter than this share of the axis is still drawn this wide. */
const MIN_BAR_PCT = 0.4

export interface LaneBar {
  lane: number
  left: number
  width: number
  /** `working` / `asking`: going on now (status colors); `done`: an ended stretch. */
  kind: 'done' | 'working' | 'asking'
}

export interface LaneArrow {
  x: number
  from: number
  to: number
  label: string
  /** The newest message: drawn a step stronger. */
  latest: boolean
  /** The gap the label sits in: between lane `gap` and `gap + 1`, the last one before the arrow's head. */
  gap: number
  /** How much of the axis the label may take before the next arrow (percent). */
  room: number
}

export interface LaneTick {
  left: number
  label: string
}

export interface LaneLayout {
  bars: LaneBar[]
  arrows: LaneArrow[]
  ticks: LaneTick[]
}

const minutesAgo = (ms: number): string => (ms < 30_000 ? '现在' : `${Math.max(1, Math.round(ms / 60_000))}m 前`)

export function laneLayout(team: TeamState, now: number): LaneLayout {
  const to = now
  const from = Math.min(Math.max(team.startedAt, now - TEAM_WINDOW_MS), now - MIN_SPAN_MS)
  const span = to - from
  const pct = (t: number): number => Math.min(100, Math.max(0, ((t - from) / span) * 100))

  const bars: LaneBar[] = []
  team.members.forEach((member, lane) => {
    for (const s of member.spans) {
      const end = s.to ?? now
      if (end < from) continue
      const left = pct(s.from)
      const kind = s.to === undefined ? s.kind : 'done'
      bars.push({ lane, left, width: Math.max(MIN_BAR_PCT, pct(end) - left), kind })
    }
  })

  const laneOf = new Map(team.members.map((m, i) => [m.name, i]))
  const shown = team.messages.filter((m) => m.at >= from && laneOf.has(m.from) && laneOf.has(m.to) && m.from !== m.to)
  const arrows: LaneArrow[] = shown.map((m, i) => {
    const a = laneOf.get(m.from)!
    const b = laneOf.get(m.to)!
    const x = pct(m.at)
    const next = shown[i + 1]
    return { x, from: a, to: b, label: m.text, latest: i === shown.length - 1, gap: b > a ? b - 1 : b, room: (next ? pct(next.at) : 100) - x }
  })

  const ticks: LaneTick[] = [
    { left: 0, label: minutesAgo(span) },
    { left: 50, label: minutesAgo(span / 2) },
    { left: 100, label: '现在' }
  ]
  return { bars, arrows, ticks }
}
