// Words and numbers on 设置 · 额度's statistics (Figma 69″): KPI lines, axis and bar labels, start dates.
import { defineMessages, pick } from '@shared/i18n'
import { changeText, formatUsd, tokenParts, type StatsPeriod, type UsageBar, type UsageView } from '@shared/usage-stats'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const M = defineMessages({
  zh: {
    weekday: ['日', '一', '二', '三', '四', '五', '六'],
    month: (d: Date) => `${d.getMonth() + 1} 月`,
    monthDayLong: (d: Date) => `${d.getMonth() + 1} 月 ${d.getDate()} 日`,
    start: (day: string) => `${day} 起`,
    today: '今天',
    monthOfYear: (d: Date, thisYear: boolean) => `${thisYear ? '' : `${d.getFullYear()} 年 `}${d.getMonth() + 1} 月`,
    dayTitle: (day: string, weekday: string) => `${day} 周${weekday}`,
    previous: { week: '比上周', month: '比上月' } as Partial<Record<StatsPeriod, string>>,
    startsAt: (day: string) => `${day}起`,
    unpriced: (share: string) => `未定价 ${share}`,
    monthlyAverage: (usd: string) => `月均 ${usd}`,
    apiEquivalent: 'API 等价',
    sessions: '会话',
    maxConcurrent: (n: number) => `最多同时 ${n} 个`,
    longestStreak: '最长连续',
    currentStreak: '连续使用',
    days: (_n: number) => '天',
    activeOfRecorded: (recorded: number, active: number) => `有记录的 ${recorded} 天里用了 ${active} 天`,
    activeOf: (recorded: number, active: number) => `${recorded} 天里用了 ${active} 天`
  },
  en: {
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    month: (d: Date) => MONTHS[d.getMonth()]!,
    monthDayLong: (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`,
    start: (day: string) => `from ${day}`,
    today: 'Today',
    monthOfYear: (d: Date, thisYear: boolean) => `${MONTHS[d.getMonth()]}${thisYear ? '' : ` ${d.getFullYear()}`}`,
    dayTitle: (day: string, weekday: string) => `${weekday}, ${day}`,
    previous: { week: 'vs last week', month: 'vs last month' } as Partial<Record<StatsPeriod, string>>,
    startsAt: (day: string) => `from ${day}`,
    unpriced: (share: string) => `${share} unpriced`,
    monthlyAverage: (usd: string) => `${usd} / month`,
    apiEquivalent: 'API equivalent',
    sessions: 'Sessions',
    maxConcurrent: (n: number) => `up to ${n} at once`,
    longestStreak: 'Longest streak',
    currentStreak: 'Current streak',
    days: (n: number) => (n === 1 ? 'day' : 'days'),
    activeOfRecorded: (recorded: number, active: number) => `used on ${active} of ${recorded} recorded days`,
    activeOf: (recorded: number, active: number) => `used on ${active} of ${recorded} days`
  }
})

export const monthDay = (t: number): string => {
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export const monthDayCn = (t: number): string => pick(M).monthDayLong(new Date(t))

/** `9/13 起`: where an agent's logs start. */
export const startLabel = (t: number): string => pick(M).start(monthDay(t))

/** Under each bar: every day in a week, every 7th day in 30 days, every month (or every Nth when there are many). */
export function barLabel(view: UsageView, i: number): string {
  const m = pick(M)
  const bar = view.bars[i]!
  const last = i === view.bars.length - 1
  const d = new Date(bar.start)
  if (view.unit === 'month') {
    const every = Math.ceil(view.bars.length / 12)
    return last || i % every === 0 ? m.month(d) : ''
  }
  if (last) return m.today
  if (view.bars.length <= 7) return `${monthDay(bar.start)} ${m.weekday[d.getDay()]}`
  // Every 7th day, but none right before 今天 (they would run into each other).
  return i % 7 === 0 && i < view.bars.length - 3 ? monthDay(bar.start) : ''
}

export function tooltipTitle(bar: UsageBar, unit: UsageView['unit']): string {
  const m = pick(M)
  const d = new Date(bar.start)
  if (unit === 'month') return m.monthOfYear(d, d.getFullYear() === new Date().getFullYear())
  return m.dayTitle(monthDayCn(bar.start), m.weekday[d.getDay()]!)
}

/** The top of the chart: 1, 2, 2.5, 4 or 5 × 10ⁿ at or above the largest bar. */
export function niceMax(n: number): number {
  if (n <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(n))
  return ([1, 2, 2.5, 4, 5, 10].map((m) => m * p).find((v) => v >= n) ?? 10 * p)
}

const trim = (n: number): string => String(Math.round(n * 100) / 100)

/** 亿 is a Chinese unit; English counts in B (10⁹) instead. */
const M_UNIT = defineMessages({ zh: { hundredMillion: '亿' }, en: { hundredMillion: '' } })

/** An axis tick in the unit of the axis's top (`max`), so one axis never mixes 亿 and M. */
export function axisLabel(n: number, max = n): string {
  if (n === 0) return '0'
  if (pick(M_UNIT).hundredMillion && max >= 1e8) return `${trim(n / 1e8)} ${pick(M_UNIT).hundredMillion}`
  if (max >= 1e9) return `${trim(n / 1e9)}B`
  if (max >= 1e6) return `${trim(n / 1e6)}M`
  if (max >= 1e3) return `${trim(n / 1e3)}K`
  return String(Math.round(n))
}

export function shareText(share: number): string {
  if (share > 0 && share < 0.01) return '<1%'
  return `${Math.round(share * 100)}%`
}

export interface Kpi {
  label: string
  num: string
  unit: string
  sub: string
  /** The sub line is a rise or fall (drawn in text/primary). */
  change: boolean
}

export function kpis(view: UsageView): Kpi[] {
  const m = pick(M)
  const long = view.period === 'year' || view.period === 'all'
  const tokens = tokenParts(view.tokens)
  const tokenChange = changeText(view.tokens, view.previousTokens)
  const costChange = changeText(view.cost, view.previousCost)
  const startsInside = view.firstAt !== null && view.firstAt > view.start
  const months = Math.max(1, view.bars.filter((b) => !b.noRecord).length)
  const tokenSub = tokenChange ? `${m.previous[view.period]} ${tokenChange}` : startsInside ? m.startsAt(monthDayCn(view.firstAt!)) : ''
  const costSub =
    view.unpricedShare >= 0.01
      ? m.unpriced(shareText(view.unpricedShare))
      : costChange
        ? `${m.previous[view.period]} ${costChange}`
        : long && view.cost > 0
          ? m.monthlyAverage(formatUsd(view.cost / months))
          : ''
  return [
    { label: 'Token', num: tokens.num, unit: tokens.unit, sub: tokenSub, change: tokenChange !== null },
    { label: m.apiEquivalent, num: formatUsd(view.cost), unit: '', sub: costSub, change: false },
    { label: m.sessions, num: view.sessions.toLocaleString('en-US'), unit: '', sub: view.maxConcurrent > 1 ? m.maxConcurrent(view.maxConcurrent) : '', change: false },
    long
      ? { label: m.longestStreak, num: String(view.longestStreak), unit: m.days(view.longestStreak), sub: view.recordedDays > 0 ? m.activeOfRecorded(view.recordedDays, view.activeDays) : '', change: false }
      : { label: m.currentStreak, num: String(view.currentStreak), unit: m.days(view.currentStreak), sub: view.recordedDays > 0 ? m.activeOf(view.recordedDays, view.activeDays) : '', change: false }
  ]
}
