// 设置 · 手机 (PRD F22, Figma 45K): the few texts the page computes. Pure.
import { encode } from 'uqr'
import { defineMessages, pick } from '@shared/i18n'

const M = defineMessages({
  zh: {
    expired: '已失效',
    expiresIn: (time: string) => `${time} 后失效`,
    justNow: '刚刚',
    minutesAgo: (n: number) => `${n} 分钟前`,
    hoursAgo: (n: number) => `${n} 小时前`,
    daysAgo: (n: number) => `${n} 天前`
  },
  en: {
    expired: 'Expired',
    expiresIn: (time: string) => `Expires in ${time}`,
    justNow: 'just now',
    minutesAgo: (n: number) => `${n} min ago`,
    hoursAgo: (n: number) => (n === 1 ? '1 hour ago' : `${n} hours ago`),
    daysAgo: (n: number) => (n === 1 ? '1 day ago' : `${n} days ago`)
  }
})

/** `4:32 后失效`; '已失效' at 0. */
export function expiresText(msLeft: number): string {
  const m = pick(M)
  if (msLeft <= 0) return m.expired
  const s = Math.ceil(msLeft / 1000)
  return m.expiresIn(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
}

/** When a phone was last connected: `刚刚`, `5 分钟前`, `3 小时前`, `3 天前`; '' when never. */
export function lastSeenText(at: number | null, now: number): string {
  if (at === null) return ''
  const m = pick(M)
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return m.justNow
  if (minutes < 60) return m.minutesAgo(minutes)
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return m.hoursAgo(hours)
  return m.daysAgo(Math.floor(hours / 24))
}

/** The QR code as one SVG path over a `size`×`size` grid of modules (no quiet zone: the tile draws it). */
export function qrPath(text: string): { size: number; d: string } {
  const { size, data } = encode(text, { ecc: 'M', border: 0 })
  let d = ''
  data.forEach((row, y) => row.forEach((dark, x) => (d += dark ? `M${x} ${y}h1v1h-1z` : '')))
  return { size, d }
}
