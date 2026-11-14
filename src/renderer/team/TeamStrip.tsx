// Claude's agent team under the lead's terminal (PRD §6.20, Figma 83′C / 83″B): one strip in the session's pane. Folded,
// one line — members, how many work / wait on you / idle, and the one that needs you; open, a lane per member over
// time with the messages they sent as arrows between lanes, so a loop (write → review → back → write) reads as one.
// Display only: a teammate's ask is answered in the lead's terminal, so 去处理 puts the keyboard there.
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Users } from 'lucide-react'
import { memberLine as progress, teamCounts, TEAM_LEAD, type TeamMemberState, type TeamState } from '@shared/agent-team'
import type { SessionId, SessionStatus } from '@shared/types'
import { useSessionMeta } from '../session-meta/store'
import { getSurface } from '../terminal/registry'
import { StatusGlyph } from '../ui/StatusGlyph'
import { laneLayout } from './lane-layout'
import styles from './TeamStrip.module.css'

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const
const GLYPH: Readonly<Record<TeamMemberState, SessionStatus>> = { working: 'running', asking: 'needs_you', idle: 'idle' }
/** Height of one lane, and where its line runs (the name line's centre), in px (Figma 83″B). */
const LANE = 46
const LINE = 9
/** The open strip redraws this often so now stays at the right edge. */
const TICK_MS = 5_000

/** Folded or open, per session, for as long as the window lives. */
const folded = new Set<SessionId>()

export function TeamStrip({ sessionId }: { sessionId: SessionId }) {
  const team = useSessionMeta((s) => s.bySession[sessionId]?.team)
  const leadModel = useSessionMeta((s) => s.bySession[sessionId]?.settings?.model)
  const [open, setOpen] = useState(() => !folded.has(sessionId))
  if (!team || team.members.length < 2) return null
  const toggle = () => {
    if (open) folded.add(sessionId)
    else folded.delete(sessionId)
    setOpen(!open)
  }
  const counts = teamCounts(team)
  const asking = team.members.find((m) => m.state === 'asking')
  const size = team.members.length - 1
  return (
    <div className={styles.strip} role="region" aria-label={`队伍 · ${size} 人`} data-testid="team-strip" data-open={open}>
      <div className={styles.head}>
        <Users {...ICON} />
        <span className={styles.title}>队伍 · {size} 人</span>
        {(['working', 'asking', 'idle'] as const).map((state) =>
          counts[state] > 0 ? (
            <span key={state} className={styles.count}>
              <StatusGlyph status={GLYPH[state]} />
              {counts[state]}
            </span>
          ) : null
        )}
        <span className={styles.spacer} />
        {!open && asking && (
          <>
            <span className={styles.ask}>
              {asking.name} {progress(asking)}
            </span>
            <button type="button" className={styles.button} onClick={() => getSurface(sessionId)?.focus()}>
              去处理
            </button>
          </>
        )}
        <button type="button" className={styles.toggle} aria-label={open ? '收起队伍' : '展开队伍'} aria-expanded={open} onClick={toggle}>
          {open ? <ChevronDown {...ICON} /> : <ChevronUp {...ICON} />}
        </button>
      </div>
      {open && <Lanes team={team} leadModel={leadModel} />}
    </div>
  )
}

function Lanes({ team, leadModel }: { team: TeamState; leadModel: string | undefined }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(timer)
  }, [])
  const { bars, arrows, ticks } = laneLayout(team, Math.max(now, lastEvent(team)))
  const height = team.members.length * LANE
  const lineY = (lane: number) => lane * LANE + LINE
  return (
    <div className={styles.lanes}>
      <div className={styles.grid} style={{ height }}>
        <div className={styles.names}>
          {team.members.map((m) => (
            <div key={m.name} className={styles.who} data-testid="team-lane" data-state={m.state}>
              <span className={styles.line}>
                <span className={styles.glyph}>
                  <StatusGlyph status={GLYPH[m.state]} />
                </span>
                <span className={styles.name}>{m.name}</span>
                {(m.name === TEAM_LEAD ? leadModel : m.model) && <span className={styles.model}>{m.name === TEAM_LEAD ? leadModel : m.model}</span>}
              </span>
              <span className={styles.progress} data-attention={m.state === 'asking'}>
                {progress(m)}
              </span>
            </div>
          ))}
        </div>
        <div className={styles.axis}>
          <svg className={styles.svg} width="100%" height={height} aria-hidden>
            {team.members.map((m, lane) => (
              <line key={m.name} className={styles.baseline} x1="0" x2="100%" y1={lineY(lane)} y2={lineY(lane)} />
            ))}
            <line className={styles.now} x1="100%" x2="100%" y1={0} y2={height} />
            {bars.map((b, i) => (
              <rect key={i} className={styles.bar} data-kind={b.kind} x={`${b.left}%`} width={`${b.width}%`} y={lineY(b.lane) - 2} height={4} rx={2} />
            ))}
            {arrows.map((a, i) => {
              const y0 = lineY(a.from)
              const y1 = lineY(a.to)
              const dir = Math.sign(y1 - y0)
              const tip = y1 - dir * 4
              return (
                <svg key={i} x={`${a.x}%`} overflow="visible" className={styles.arrow} data-latest={a.latest}>
                  <circle cx={0} cy={y0} r={2.5} />
                  <path d={`M 0 ${y0 + dir * 3} L 0 ${tip} M -3.5 ${tip - dir * 6} L 0 ${tip} L 3.5 ${tip - dir * 6}`} />
                </svg>
              )
            })}
          </svg>
          {arrows.map((a, i) => (
            <span
              key={i}
              className={styles.label}
              data-latest={a.latest}
              style={{ left: `calc(${a.x}% + 6px)`, top: (lineY(a.gap) + lineY(a.gap + 1)) / 2 - 8, maxWidth: `calc(${a.room}% - 12px)` }}
            >
              {a.label}
            </span>
          ))}
        </div>
      </div>
      <div className={styles.ticks}>
        {ticks.map((t) => (
          <span key={t.left} style={{ left: `${t.left}%` }} data-edge={t.left === 0 ? 'start' : t.left === 100 ? 'end' : undefined}>
            {t.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/** The newest time the team knows of: a replayed or skewed clock never puts its last event right of now. */
function lastEvent(team: TeamState): number {
  let at = team.startedAt
  for (const m of team.members) for (const s of m.spans) at = Math.max(at, s.to ?? s.from)
  for (const msg of team.messages) at = Math.max(at, msg.at)
  return at
}
