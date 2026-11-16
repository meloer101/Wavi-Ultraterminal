// Where the team's lanes draw what (Figma 83″B): one lane per member, time left to right with now at the right edge.
// Positions are percentages of the time axis, so the strip lays them out at any width without measuring.
import { TEAM_WINDOW_MS, type TeamState } from '@shared/agent-team'
import { defineMessages, pick } from '@shared/i18n'

const M = defineMessages({
  zh: { now: '现在', ago: (minutes: number) => `${minutes}m 前` },
  en: { now: 'now', ago: (minutes: number) => `${minutes}m ago` }
})

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
  /** How much of the axis the label may take before the next arrow through its gap (percent). */
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

const minutesAgo = (ms: number): string => (ms < 30_000 ? pick(M).now : pick(M).ago(Math.max(1, Math.round(ms / 60_000))))

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
  const placed = shown.map((m) => ({ m, a: laneOf.get(m.from)!, b: laneOf.get(m.to)!, x: pct(m.at) }))
  // An arrow between lanes a and b passes through the gaps min(a, b) … max(a, b) - 1.
  const crosses = (p: (typeof placed)[number], gap: number): boolean => Math.min(p.a, p.b) <= gap && gap < Math.max(p.a, p.b)
  const arrows: LaneArrow[] = placed.map((p, i) => {
    const gap = p.b > p.a ? p.b - 1 : p.b
    const next = placed.slice(i + 1).find((q) => crosses(q, gap))
    return { x: p.x, from: p.a, to: p.b, label: p.m.text, latest: i === placed.length - 1, gap, room: (next ? next.x : 100) - p.x }
  })

  const ticks: LaneTick[] = [
    { left: 0, label: minutesAgo(span) },
    { left: 50, label: minutesAgo(span / 2) },
    { left: 100, label: pick(M).now }
  ]
  return { bars, arrows, ticks }
}
