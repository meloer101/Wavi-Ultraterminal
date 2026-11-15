// 设置 · 额度 (PRD F11 · 额度页, Figma 69″ / 69′A–D): the plan windows of Claude and Codex side by side, then what the
// agents' own logs on this Mac say about token use by week / month / year / all. Opening the page asks every account once
// (main keeps its own limits) and scans the logs (main's worker, cached while the app runs). The sidebar's 额度 and ⇧⌘U
// open settings here. 额度提醒 lives here too.
import { USAGE_VENDORS } from '@shared/agents'
import { useEffect, useMemo, useState } from 'react'
import { CLI_AGENTS, type CliAgent } from '@shared/agents'
import type { AgentAvailability } from '@shared/ipc'
import { orderByTightest, vendorStatus, VENDOR_LABEL, windowKey } from '@shared/session-meta'
import type { AlertSettings } from '@shared/settings'
import { defineMessages } from '@shared/i18n'
import { heatmap, isStatsAgent, usageView, type StatsPeriod, type UsageDataset } from '@shared/usage-stats'
import { useMetaNow } from '../session-meta/MetaChips'
import { useSessionMeta } from '../session-meta/store'
import { UsageAgentRow, UsageWindowRow } from '../session-meta/UsageRows'
import { Segmented } from '../ui/Segmented'
import { useMessages } from '../i18n'
import { Row, Section, Toggle } from './controls'
import { Breakdowns, Kpis, UsageChart, UsageHeatmap } from './usage/UsageStats'
import styles from './UsagePane.module.css'

const M = defineMessages({
  zh: {
    title: '额度',
    period: '统计周期',
    periods: { week: '周', month: '月', year: '年', all: '全部' },
    loading: '读取中…',
    failed: '读取失败',
    alerts: '提醒',
    usageAlert: '用到 75%、90% 和用完时发通知'
  },
  en: {
    title: 'Usage',
    period: 'Period',
    periods: { week: 'Week', month: 'Month', year: 'Year', all: 'All' },
    loading: 'Loading…',
    failed: 'Couldn’t read usage',
    alerts: 'Alerts',
    usageAlert: 'Notify at 75%, 90% and when out of usage'
  }
})

const PERIODS: readonly StatsPeriod[] = ['week', 'month', 'year', 'all']

type Stats = { state: 'loading' } | { state: 'failed' } | { state: 'ok'; data: UsageDataset }

export function UsagePane({ alerts, updateAlerts }: { alerts: AlertSettings | null; updateAlerts: (patch: Partial<AlertSettings>) => void }) {
  const now = useMetaNow()
  const usage = useSessionMeta((s) => s.usage)
  const accounts = useSessionMeta((s) => s.accounts)
  const [found, setFound] = useState<AgentAvailability | null>(null)
  const [period, setPeriod] = useState<StatsPeriod>('month')
  const [stats, setStats] = useState<Stats>({ state: 'loading' })
  const m = useMessages(M)

  useEffect(() => {
    // Looking at the page asks every account now, vendors never used here included, and reads the logs.
    window.tr.agent.refreshUsage(true)
    let live = true
    void window.tr.app
      .detectAgents()
      .then((next) => live && setFound(next))
      .catch(() => live && setFound({}))
    window.tr.agent.getUsageStats().then(
      (data) => live && setStats({ state: 'ok', data }),
      () => live && setStats({ state: 'failed' })
    )
    return () => {
      live = false
    }
  }, [])

  // A plan vendor is listed when its CLI is installed or its account said anything.
  const planRows = orderByTightest(
    USAGE_VENDORS.filter((v) => found?.[v] || usage[v] || (accounts[v] && accounts[v].state !== 'missing')).map((vendor) => ({ vendor })),
    usage,
    now
  )
  // Installed agents whose logs Wavi does not read are listed under 按 agent as 暂不支持.
  const unsupported: CliAgent[] = found ? CLI_AGENTS.filter((id) => found[id] && !isStatsAgent(id)) : []
  const data = stats.state === 'ok' ? stats.data : null
  const view = useMemo(() => (data ? usageView(data, period, now) : null), [data, period, now])
  const heat = useMemo(() => (data ? heatmap(data, now) : null), [data, now])

  return (
    <div className={styles.page}>
      <div className={styles.form}>
        <div className={styles.head}>
          <h1 className={styles.title}>{m.title}</h1>
          <Segmented label={m.period} value={period} options={PERIODS.map((value) => ({ value, label: m.periods[value] }))} onChange={setPeriod} semantics="tab" arrows="focus" />
        </div>
        <div className={styles.plans}>
          {planRows.map(({ vendor }) => {
            const { text, windows } = vendorStatus(usage[vendor], accounts[vendor], now)
            return (
              <section key={vendor} className={styles.group} aria-label={VENDOR_LABEL[vendor]} data-testid={`usage-page-${vendor}`}>
                <UsageAgentRow agent={vendor} name={VENDOR_LABEL[vendor]} status={text} />
                {windows.map((w) => (
                  <UsageWindowRow key={windowKey(w)} vendor={vendor} w={w} now={now} testIdPrefix="usage-page-window" />
                ))}
              </section>
            )
          })}
        </div>
        <div className={styles.rule} />
        {stats.state === 'loading' && <p className={styles.note}>{m.loading}</p>}
        {stats.state === 'failed' && <p className={styles.note}>{m.failed}</p>}
        {view && heat && (
          <div className={styles.stats} data-testid="usage-stats">
            <Kpis view={view} />
            <UsageChart view={view} />
            <UsageHeatmap heat={heat} />
            <Breakdowns view={view} unsupported={unsupported} />
          </div>
        )}
        <div className={styles.rule} />
        {alerts && (
          <Section title={m.alerts}>
            <Row label={m.usageAlert}>
              <Toggle label={m.usageAlert} checked={alerts.usage} onChange={(on) => updateAlerts({ usage: on })} />
            </Row>
          </Section>
        )}
      </div>
    </div>
  )
}
