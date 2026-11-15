// Fixture data matching Figma screen 01 (14:2). Used until real sessions exist (M1/M2).
import { defineMessages, pick } from '@shared/i18n'
import type { Project, Session, Worktree } from '@shared/types'

const now = Date.now()
const minutesAgo = (m: number) => now - m * 60_000

const M = defineMessages({
  zh: {
    cookie: 'Cookie 会话迁移',
    cookieAction: '编辑 src/auth/session.ts',
    perf: '结算页性能优化',
    perfAction: '运行 pnpm test checkout',
    nav: '修复移动端导航抖动',
    navAction: '已完成，等你审阅',
    sidebar: '侧边栏状态聚合',
    sidebarAction: '读取 src/state/agents.ts',
    graph: 'Git 图谱布局算法',
    graphAction: 'pnpm build 失败 · 2 个错误'
  },
  en: {
    cookie: 'Cookie session migration',
    cookieAction: 'Editing src/auth/session.ts',
    perf: 'Checkout page performance',
    perfAction: 'Running pnpm test checkout',
    nav: 'Fix mobile nav jitter',
    navAction: 'Done · ready for review',
    sidebar: 'Sidebar status rollup',
    sidebarAction: 'Reading src/state/agents.ts',
    graph: 'Git graph layout algorithm',
    graphAction: 'pnpm build failed · 2 errors'
  }
})

type MockText = keyof (typeof M)['zh']

/**
 * A fixture session whose title and line read the interface language when they are read (the fixtures are built
 * at module load, before the window's language is set); copies the store makes keep the language of that moment.
 */
function withText(session: Omit<Session, 'title' | 'currentAction'>, title: MockText, currentAction: MockText): Session {
  return Object.defineProperties(session, {
    title: { get: () => pick(M)[title], enumerable: true, configurable: true },
    currentAction: { get: () => pick(M)[currentAction], enumerable: true, configurable: true }
  }) as Session
}

export const mockProjects: Project[] = [
  { id: 'p-acme', name: 'acme-web', rootPath: '~/code/acme-web' },
  { id: 'p-tr', name: 'terminal-reborn', rootPath: '~/code/terminal-reborn' }
]

export const mockWorktrees: Worktree[] = [
  { id: 'w-cookie', projectId: 'p-acme', branch: 'jacob/session-cookie', path: '~/.tr/worktrees/acme-web/session-cookie', isMain: false, baseBranch: 'main', added: 42, removed: 18 },
  { id: 'w-perf', projectId: 'p-acme', branch: 'jacob/checkout-perf', path: '~/.tr/worktrees/acme-web/checkout-perf', isMain: false, baseBranch: 'main', added: 128, removed: 35 },
  { id: 'w-nav', projectId: 'p-acme', branch: 'jacob/mobile-nav-jitter', path: '~/.tr/worktrees/acme-web/mobile-nav-jitter', isMain: false, baseBranch: 'main', added: 23, removed: 9 },
  { id: 'w-acme-main', projectId: 'p-acme', branch: 'main', path: '~/code/acme-web', isMain: true },
  { id: 'w-sidebar', projectId: 'p-tr', branch: 'jacob/sidebar-status', path: '~/.tr/worktrees/terminal-reborn/sidebar-status', isMain: false, baseBranch: 'main', added: 61, removed: 4 },
  { id: 'w-graph', projectId: 'p-tr', branch: 'jacob/graph-layout', path: '~/.tr/worktrees/terminal-reborn/graph-layout', isMain: false, baseBranch: 'main', added: 210, removed: 12 }
]

export const mockSessions: Session[] = [
  withText({ id: 's-cookie', worktreeId: 'w-cookie', kind: 'claude', status: 'running', startedAt: minutesAgo(4), lastActivityAt: now }, 'cookie', 'cookieAction'),
  withText({ id: 's-perf', worktreeId: 'w-perf', kind: 'codex', status: 'running', startedAt: minutesAgo(12), lastActivityAt: minutesAgo(1) }, 'perf', 'perfAction'),
  withText({ id: 's-nav', worktreeId: 'w-nav', kind: 'claude', status: 'done_unread', startedAt: minutesAgo(2), lastActivityAt: minutesAgo(2) }, 'nav', 'navAction'),
  { id: 's-acme-main', worktreeId: 'w-acme-main', kind: 'shell', title: 'main', status: 'idle', startedAt: minutesAgo(30), lastActivityAt: minutesAgo(30) },
  withText({ id: 's-sidebar', worktreeId: 'w-sidebar', kind: 'claude', status: 'running', startedAt: minutesAgo(6), lastActivityAt: now }, 'sidebar', 'sidebarAction'),
  withText({ id: 's-graph', worktreeId: 'w-graph', kind: 'claude', status: 'error', startedAt: minutesAgo(18), lastActivityAt: minutesAgo(3) }, 'graph', 'graphAction')
]
