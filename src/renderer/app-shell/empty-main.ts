// Pure helpers for the welcome page (EmptyMain.tsx, PRD F18 · Figma 14).
import { CLI_AGENTS, type CliAgent } from '@shared/agents'
import type { AgentAvailability } from '@shared/ipc'
import { defineMessages, localized, pick } from '@shared/i18n'

const M = defineMessages({
  zh: {
    morning: '早上好',
    noon: '中午好',
    afternoon: '下午好',
    evening: '晚上好',
    night: '夜深了',
    withName: (hello: string, name: string) => `${hello}，${name}`
  },
  en: {
    morning: 'Good morning',
    noon: 'Hello',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
    night: 'Up late',
    withName: (hello: string, name: string) => `${hello}, ${name}`
  }
})

/** 5–11 早上好 · 11–13 中午好 · 13–18 下午好 · 18–23 晚上好 · 23–5 夜深了. */
export function greetingFor(hour: number): string {
  const m = pick(M)
  if (hour >= 5 && hour < 11) return m.morning
  if (hour >= 11 && hour < 13) return m.noon
  if (hour >= 13 && hour < 18) return m.afternoon
  if (hour >= 18 && hour < 23) return m.evening
  return m.night
}

/** "下午好，Jacoy", or just "下午好" without a name. */
export function greeting(hour: number, name: string): string {
  const hello = greetingFor(hour)
  return name ? pick(M).withName(hello, name) : hello
}

export interface Quote {
  text: string
  /** Attribution, shown after the line in tertiary; none for our own lines. */
  by?: string
}

/** Short lines only: classic programming maxims (attributed) and our own. Attributed lines drop the final 。. */
export const QUOTES: readonly Quote[] = localized(
  defineMessages<readonly Quote[]>({
    zh: [
      { text: '先让它跑起来，再让它跑对，最后让它跑快', by: 'Kent Beck' },
      { text: '简单是可靠的前提', by: 'Edsger Dijkstra' },
      { text: '过早优化是万恶之源', by: 'Donald Knuth' },
      { text: '让 agent 去写，你来决定写什么。' },
      { text: '一次只做一件事，但可以同时开很多个会话。' },
      { text: '好的提交说明，是写给三个月后的自己。' },
      { text: '先读懂 diff，再按合并。' }
    ],
    en: [
      { text: 'Make it work, make it right, make it fast', by: 'Kent Beck' },
      { text: 'Simplicity is prerequisite for reliability', by: 'Edsger Dijkstra' },
      { text: 'Premature optimization is the root of all evil', by: 'Donald Knuth' },
      { text: 'Let the agent write; you decide what gets written.' },
      { text: 'One thing at a time, but as many sessions as you like.' },
      { text: 'A good commit message is a note to yourself three months from now.' },
      { text: 'Read the diff before you press merge.' }
    ]
  })
)

/** One line per launch; `random` is injectable for tests. */
export function pickQuote(random: () => number = Math.random): Quote {
  const index = Math.min(QUOTES.length - 1, Math.floor(random() * QUOTES.length))
  return QUOTES[index]!
}

export interface InstallableAgent {
  id: string
  name: string
  command: string
}

/** The picker on the welcome page when no supported agent is installed (14C). Claude Code first: the default. */
export const INSTALLABLE_AGENTS: readonly InstallableAgent[] = [
  { id: 'claude', name: 'Claude Code', command: 'npm i -g @anthropic-ai/claude-code' },
  { id: 'codex', name: 'Codex', command: 'npm i -g @openai/codex' },
  { id: 'cursor', name: 'Cursor', command: 'curl https://cursor.com/install -fsS | bash' },
  { id: 'gemini', name: 'Gemini', command: 'npm i -g @google/gemini-cli' },
  { id: 'grok', name: 'Grok', command: 'curl -fsSL https://x.ai/cli/install.sh | bash' }
]

/** The install block shows only once detection finished and no agent CLI Wavi can start is on PATH. */
export function needsAgentInstall(agents: AgentAvailability | null): boolean {
  return agents !== null && !CLI_AGENTS.some((id) => agents[id])
}

/** What the welcome screen's “新建会话” starts: Claude Code, else Codex, else the first installed CLI. */
export function defaultAgent(agents: AgentAvailability | null): CliAgent {
  return CLI_AGENTS.find((id) => agents?.[id]) ?? 'claude'
}
