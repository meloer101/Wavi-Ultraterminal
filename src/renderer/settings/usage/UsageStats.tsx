// 设置 · 额度's token statistics (PRD F11, Figma 69″ / 69′A): KPIs, the daily or monthly bars, the past-year heatmap and
// the shares by agent, model, project and hour. Monochrome: agents are told apart by steps of text/primary, never hue.
// Every agent counts from its own oldest log; bars and heat cells before any log are empty frames.
import { useState } from 'react'
import { agentName, type CliAgent } from '@shared/agents'
import { formatTokens, type Heatmap, type StatsAgent, type UsageView } from '@shared/usage-stats'
import { defineMessages } from '@shared/i18n'
import { AgentIcon } from '../../ui/AgentIcon'
import { useLang, useMessages } from '../../ui/i18n'
import { axisLabel, barLabel, kpis, monthDayCn, niceMax, shareText, startLabel, tooltipTitle } from './labels'
import styles from './UsageStats.module.css'

const M = defineMessages({
  zh: {
    perDay: '每天 · token',
    perMonth: '每月 · token',
    noRecords: '还没有记录',
    months: ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月', '7 月', '8 月', '9 月', '10 月', '11 月', '12 月'],
    pastYear: '过去一年',
    longestStreak: (n: number) => `最长连续 ${n} 天`,
    busiest: (day: string, tokens: string) => `最忙 ${day} · ${tokens}`,
    weekdays: ['一', '三', '五'],
    noRecord: (day: string) => `${day} · 没有记录`,
    less: '少',
    more: '多',
    unsupported: '暂不支持',
    other: (n: string) => `其他 ${n} 个`,
    byAgent: '按 agent',
    byModel: '按模型',
    byProject: '按项目',
    hourly: '每小时',
    hour: (h: number) => `${h} 点`
  },
  en: {
    perDay: 'Per day · tokens',
    perMonth: 'Per month · tokens',
    noRecords: 'No records yet',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    pastYear: 'Past year',
    longestStreak: (n: number) => `Longest streak ${n} ${n === 1 ? 'day' : 'days'}`,
    busiest: (day: string, tokens: string) => `Busiest ${day} · ${tokens}`,
    weekdays: ['Mon', 'Wed', 'Fri'],
    noRecord: (day: string) => `${day} · no record`,
    less: 'Less',
    more: 'More',
    unsupported: 'Not supported yet',
    other: (n: string) => `${n} others`,
    byAgent: 'By agent',
    byModel: 'By model',
    byProject: 'By project',
    hourly: 'By hour',
    hour: (h: number) => `${h}:00`
  }
})

/** The tone of each agent's part, in the order of the 按 agent list (most used first). */
const TONES = [1, 0.55, 0.3, 0.16]
const tone = (order: readonly StatsAgent[], agent: StatsAgent): number => TONES[Math.min(order.indexOf(agent), TONES.length - 1)] ?? TONES.at(-1)!

export function Kpis({ view }: { view: UsageView }) {
  useLang()
  return (
    <div className={styles.kpis} data-testid="usage-kpis">
      {kpis(view).map((k) => (
        <div key={k.label} className={styles.kpi}>
          <span className={styles.kpiLabel}>{k.label}</span>
          <span className={styles.kpiValue}>
            <span className={styles.kpiNum}>{k.num}</span>
            {k.unit && <span className={styles.kpiUnit}>{k.unit}</span>}
          </span>
          <span className={styles.kpiSub} data-change={k.change}>
            {k.sub || ' '}
          </span>
        </div>
      ))}
    </div>
  )
}

export function UsageChart({ view }: { view: UsageView }) {
  const [hover, setHover] = useState<number | null>(null)
  const m = useMessages(M)
  const order = view.byAgent.map((r) => r.agent)
  const max = niceMax(Math.max(0, ...view.bars.map((b) => b.tokens)))
  const starts = new Map(view.startsInPeriod.map((s) => [s.agent, s.at]))
  const bar = hover === null ? null : view.bars[hover]
  return (
    <section className={styles.block} aria-label={view.unit === 'day' ? m.perDay : m.perMonth}>
      <div className={styles.blockHead}>
        <span className={styles.blockTitle}>{view.unit === 'day' ? m.perDay : m.perMonth}</span>
        <span className={styles.legend}>
          {order.map((agent) => (
            <span key={agent} className={styles.legendItem}>
              <span className={styles.swatch} style={{ opacity: tone(order, agent) }} />
              {agentName(agent)}
              {starts.has(agent) && <span className={styles.legendStart}>{startLabel(starts.get(agent)!)}</span>}
            </span>
          ))}
        </span>
      </div>
      <div className={styles.chart} onMouseLeave={() => setHover(null)}>
        <div className={styles.plot}>
          <span className={styles.grid} style={{ top: 0 }} />
          <span className={styles.grid} style={{ top: '50%' }} />
          <span className={styles.baseline} />
          {view.firstAt === null && <span className={styles.empty}>{m.noRecords}</span>}
          <div className={styles.bars} style={{ gridTemplateColumns: `repeat(${view.bars.length}, 1fr)` }}>
            {view.bars.map((b, i) => (
              <div key={b.start} className={styles.slot} onMouseEnter={() => setHover(i)} data-testid="usage-bar">
                {b.noRecord ? (
                  <span className={styles.noRecord} />
                ) : (
                  <span className={styles.stack} data-hover={hover === i} style={{ height: `${(b.tokens / max) * 100}%` }}>
                    {order
                      .filter((a) => (b.perAgent[a] ?? 0) > 0)
                      .map((a) => (
                        <span key={a} className={styles.part} style={{ flexGrow: b.perAgent[a], opacity: tone(order, a) }} />
                      ))}
                  </span>
                )}
                <span className={styles.barLabel} data-now={i === view.bars.length - 1}>
                  {barLabel(view, i)}
                </span>
              </div>
            ))}
          </div>
          {bar && !bar.noRecord && hover !== null && (
            <div className={styles.tooltip} role="tooltip" data-side={hover > view.bars.length / 2 ? 'left' : 'right'} style={{ ['--at' as string]: `${((hover + 0.5) / view.bars.length) * 100}%` }}>
              <div className={styles.tipHead}>
                <span>{tooltipTitle(bar, view.unit)}</span>
                <span>{formatTokens(bar.tokens)}</span>
              </div>
              {order.map((a) => {
                const start = view.byAgent.find((r) => r.agent === a)?.firstAt ?? 0
                const notYet = start >= bar.end
                return (
                  <div key={a} className={styles.tipRow}>
                    <span className={styles.swatchSmall} style={{ opacity: tone(order, a) }} />
                    <span className={styles.tipName}>{agentName(a)}</span>
                    <span className={styles.tipValue} data-muted={notYet}>
                      {notYet ? startLabel(start) : formatTokens(bar.perAgent[a] ?? 0)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className={styles.axis} aria-hidden>
          <span>{axisLabel(max)}</span>
          <span>{axisLabel(max / 2, max)}</span>
          <span>0</span>
        </div>
      </div>
    </section>
  )
}

export function UsageHeatmap({ heat }: { heat: Heatmap }) {
  const m = useMessages(M)
  const weeks = Math.ceil(heat.days.length / 7)
  const monthCols: { col: number; label: string }[] = []
  heat.days.forEach((d, i) => {
    const date = new Date(d.day)
    if (date.getDate() === 1 || i === 0) monthCols.push({ col: Math.floor(i / 7), label: m.months[date.getMonth()]! })
  })
  return (
    <section className={styles.block} aria-label={m.pastYear}>
      <div className={styles.blockHead}>
        <span className={styles.blockTitle}>{m.pastYear}</span>
        <span className={styles.facts}>
          {heat.longestStreak > 0 && <span>{m.longestStreak(heat.longestStreak)}</span>}
          {heat.busiest && <span>{m.busiest(monthDayCn(heat.busiest.day), formatTokens(heat.busiest.tokens))}</span>}
        </span>
      </div>
      <div className={styles.heat} style={{ ['--weeks' as string]: weeks }}>
        <div className={styles.heatMonths}>
          {monthCols
            .filter((c, i) => i === 0 || c.col - monthCols[i - 1]!.col >= 3)
            .map((c) => (
              <span key={`${c.col}`} style={{ ['--col' as string]: c.col }}>
                {c.label}
              </span>
            ))}
        </div>
        <div className={styles.heatDays} aria-hidden>
          <span>{m.weekdays[0]}</span>
          <span />
          <span>{m.weekdays[1]}</span>
          <span />
          <span>{m.weekdays[2]}</span>
        </div>
        <div className={styles.heatGrid} data-testid="usage-heatmap">
          {heat.days.map((d) => (
            <span
              key={d.day}
              className={styles.cell}
              data-level={d.level ?? 'none'}
              title={d.level === null ? m.noRecord(monthDayCn(d.day)) : `${monthDayCn(d.day)} · ${formatTokens(d.tokens)}`}
            />
          ))}
        </div>
      </div>
      <div className={styles.heatLegend} aria-hidden>
        {m.less}
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={styles.cell} data-level={l} />
        ))}
        {m.more}
      </div>
    </section>
  )
}

interface ShareItem {
  key: string
  name: string
  icon?: CliAgent
  start?: string
  tokens: number | null
  share: number
}

function ShareList({ title, items, testId }: { title: string; items: ShareItem[]; testId: string }) {
  const m = useMessages(M)
  const max = Math.max(0.0001, ...items.map((i) => i.share))
  return (
    <section className={styles.shareList} aria-label={title} data-testid={testId}>
      <span className={styles.blockTitle}>{title}</span>
      {items.map((item) => (
        <div key={item.key} className={styles.shareRow} data-unsupported={item.tokens === null}>
          <span className={styles.shareName}>
            {item.icon && <AgentIcon kind={item.icon} />}
            <span className={styles.shareLabel}>{item.name}</span>
            {item.start && <span className={styles.shareStart}>{item.start}</span>}
          </span>
          <span className={styles.shareBar}>{item.tokens !== null && <span style={{ width: `${Math.max(2, (item.share / max) * 100)}%` }} />}</span>
          <span className={styles.shareTokens}>{item.tokens === null ? m.unsupported : formatTokens(item.tokens)}</span>
          <span className={styles.sharePct}>{item.tokens === null ? '' : shareText(item.share)}</span>
        </div>
      ))}
    </section>
  )
}

export function Breakdowns({ view, unsupported }: { view: UsageView; unsupported: readonly CliAgent[] }) {
  const m = useMessages(M)
  const otherName = (key: string): string => (key.startsWith('other:') ? m.other(key.slice(6)) : key)
  const starts = new Set(view.startsInPeriod.map((s) => s.agent))
  const agents: ShareItem[] = [
    ...view.byAgent.map((r) => ({ key: r.agent, name: agentName(r.agent), icon: r.agent, tokens: r.tokens, share: r.share, ...(starts.has(r.agent) ? { start: startLabel(r.firstAt) } : {}) })),
    ...unsupported.map((a) => ({ key: a, name: agentName(a), icon: a, tokens: null, share: 0 }))
  ]
  const rows = (list: UsageView['byModel']): ShareItem[] => list.map((r) => ({ key: r.key, name: otherName(r.key), tokens: r.tokens, share: r.share }))
  const peak = view.hours.indexOf(Math.max(...view.hours))
  const hourMax = Math.max(1, ...view.hours)
  return (
    <div className={styles.breakdowns}>
      <ShareList title={m.byAgent} items={agents} testId="usage-by-agent" />
      <ShareList title={m.byModel} items={rows(view.byModel)} testId="usage-by-model" />
      <ShareList title={m.byProject} items={rows(view.byProject)} testId="usage-by-project" />
      <section className={styles.shareList} aria-label={m.hourly}>
        <span className={styles.blockTitle}>{m.hourly}</span>
        <div className={styles.hours}>
          {view.hours.map((h, i) => (
            <span key={i} className={styles.hour} data-peak={view.tokens > 0 && i === peak} style={{ height: `${Math.max(2, (h / hourMax) * 100)}%` }} />
          ))}
        </div>
        <div className={styles.hourAxis} aria-hidden>
          {[0, 6, 12, 18]
            // A tick next to the peak's label would run into it.
            .filter((h) => view.tokens === 0 || h === peak || Math.abs(h - peak) > 2)
            .map((h) => (
              <span key={h} style={{ ['--h' as string]: h }}>
                {h}
              </span>
            ))}
          {view.tokens > 0 && ![0, 6, 12, 18].includes(peak) && (
            <span className={styles.hourPeak} style={{ ['--h' as string]: peak }}>
              {m.hour(peak)}
            </span>
          )}
        </div>
      </section>
    </div>
  )
}
