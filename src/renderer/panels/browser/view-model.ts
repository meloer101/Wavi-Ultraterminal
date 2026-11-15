// What the 浏览器 view shows for a page state (Figma 13A / 13E). Pure, so the rules are unit-tested.
import type { AgentKind } from '@shared/types'
import { localPortOf, portUrl, type BrowserPageState, type ConsoleSummary, type ListeningPort } from '@shared/browser'
import { defineMessages, pick } from '@shared/i18n'

const M = defineMessages({
  zh: {
    hintPorts: '点一下上面的端口就能打开，或在地址栏输入地址。',
    hintNoPorts: '运行 dev server 后，检测到的端口会出现在这里，点一下就能打开。',
    warnings: (n: number) => `${n} 个警告`,
    errors: (n: number) => `${n} 个错误`,
    loading: '正在载入…',
    noErrors: '控制台没有错误',
    sendToTerminal: '发到终端',
    sendTo: (agent: string) => `发给 ${agent}`
  },
  en: {
    hintPorts: 'Click a port above to open it, or type an address in the address bar.',
    hintNoPorts: 'Once a dev server runs, the ports it opens show up here. Click one to open it.',
    warnings: (n: number) => `${n} ${n === 1 ? 'warning' : 'warnings'}`,
    errors: (n: number) => `${n} ${n === 1 ? 'error' : 'errors'}`,
    loading: 'Loading…',
    noErrors: 'No console errors',
    sendToTerminal: 'Send to terminal',
    sendTo: (agent: string) => `Send to ${agent}`
  }
})

export type WellContent = 'empty' | 'error' | 'page'

export interface BrowserLayout {
  /** The ports row (端口 · tags): only when a port was found. */
  ports: boolean
  /** The console row at the bottom. */
  console: boolean
  well: WellContent
}

/** The ports row only when ports were found; the console row once a page loaded. */
export function browserLayout(page: BrowserPageState | undefined, ports: readonly ListeningPort[]): BrowserLayout {
  const hasPorts = ports.length > 0
  if (!page?.url) return { ports: hasPorts, console: false, well: 'empty' }
  return { ports: hasPorts, console: !page.loadError, well: page.loadError ? 'error' : 'page' }
}

/** The empty state's second line: what to do next. */
export function emptyHint(ports: readonly ListeningPort[]): string {
  return ports.length > 0 ? pick(M).hintPorts : pick(M).hintNoPorts
}

export interface ConsoleLine {
  /** Shown with an error StatusGlyph in the error color. */
  errors: string | null
  /** Tertiary text after the errors (or alone). */
  rest: string
}

/** "2 个错误" · "· 1 个警告"; "控制台没有错误" when quiet; "正在载入…" while loading with nothing to report. */
export function consoleLine(summary: ConsoleSummary, loading: boolean): ConsoleLine {
  const m = pick(M)
  const warnings = summary.warnings > 0 ? m.warnings(summary.warnings) : ''
  if (summary.errors > 0) return { errors: m.errors(summary.errors), rest: warnings ? `· ${warnings}` : '' }
  if (warnings) return { errors: null, rest: warnings }
  return { errors: null, rest: loading ? m.loading : m.noErrors }
}

/** "发给 Claude" / "发给 Codex"; a plain shell only gets the text in its input line too ("发到终端"). */
export function sendLabel(kind: AgentKind): string {
  if (kind === 'shell') return pick(M).sendToTerminal
  return pick(M).sendTo(kind === 'codex' ? 'Codex' : 'Claude')
}

/** Whether the page shows this port (same host and port as the tag opens). */
export function isOpenPort(port: ListeningPort, pageUrl: string): boolean {
  try {
    return new URL(pageUrl).origin === new URL(portUrl(port)).origin || (port.host === 'localhost' && localPortOf(pageUrl) === port.port)
  } catch {
    return false
  }
}

/** `:5173 vite` */
export function portText(port: ListeningPort): string {
  return port.label ? `:${port.port} ${port.label}` : `:${port.port}`
}
