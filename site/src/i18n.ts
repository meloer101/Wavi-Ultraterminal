/* Page copy in both languages. English is the default (served at "/"); Chinese lives at "/zh/".
   The layout is the Figma magazine W9 (spreads at 1440×900, phone pages at 390×844); English copy is W9's word for word. */

export type Lang = 'en' | 'zh'

/** A numbered feature: "(I) Title." plus one line. */
export type Item = [title: string, body: string]
/** One look (app screenshot): its index name and its caption. */
export interface Look {
  name: string
  caption: string
  alt: string
}

const en = {
  htmlLang: 'en',
  meta: {
    title: 'Wavi — One person, many threads',
    description: 'Wavi is a macOS coding terminal for people who run several coding agents at once: each agent works on its own branch, and Wavi only calls you when one needs you. Free, open source, no telemetry.'
  },
  skip: 'Skip to content',
  bar: {
    home: 'Wavi, first page',
    label: 'Sections',
    status: 'Status',
    merge: 'Merge',
    wardrobe: 'Wardrobe',
    ship: 'Ship',
    download: 'Download',
    other: '中文',
    otherLabel: '切换到中文'
  },
  issue: 'Wavi — Collection Nº 1',
  cover: {
    kicker: 'Collection Nº 1  ·  Autumn – Winter 2026',
    title: ['One person,', 'many threads.'],
    sub: 'A coding terminal for multithreaders and ADHD brains.',
    download: 'Download for macOS',
    github: 'GitHub'
  },
  looks: [
    { name: 'Session, light', caption: 'Session, light. Glass sidebar, one thread open.', alt: 'Wavi in light mode: a glass sidebar of sessions and one Claude Code session open.' },
    { name: 'Overview, dark', caption: 'Overview, dark. Eight sessions; only the one waiting on you lights up.', alt: 'Wavi in dark mode: a sidebar of sessions, one marked as waiting, next to a running agent.' },
    { name: 'Board, dark', caption: 'Board, dark. Every session by status.', alt: 'Wavi’s board in dark mode: session cards in columns by status.' },
    { name: 'Hand-off, light', caption: 'Hand-off, light. One agent splits the job; three report back.', alt: 'A chat session in Wavi: one agent hands three tasks to other agents, drawn as a branching graph.' },
    { name: 'Side by side, dark', caption: 'Side by side, dark. Four sessions in one window; one more torn off into its own.', alt: 'Wavi in dark mode with several sessions split side by side and a file tree.' },
    { name: 'GitHub, light', caption: 'GitHub, light. Every issue and PR, one click from an agent.', alt: 'Wavi’s GitHub board in light mode: issues and pull requests for two projects.' }
  ] satisfies Look[],
  index: { label: 'Index', look: 'Look' },
  collection: {
    label: 'On the collection',
    items: [
      ['Hold every thread.', 'Claude Code, Codex and seventeen more, each on a branch of its own. The one waiting on you lights up.'],
      ['Wear it your way.', 'Terminal or chat, per session. Glass or solid, your wallpaper, your fonts.'],
      ['Leave the chores.', 'Commit, push and fix CI in one place. Nothing runs on its own unless you say so.']
    ] satisfies Item[]
  },
  status: {
    label: 'Status',
    title: ['Who’s waiting?'],
    body: 'Running, done, stuck: each looks different. Only the one waiting on you lights up. Press ⌘J to jump there. Group the sidebar by status, or see every project on one board.',
    still: 'Still — one window lit.'
  },
  ensemble: {
    label: 'Ensemble',
    title: ['One task,', 'many hands.'],
    items: [
      ['Hand it out.', 'Ask one agent to split the job: Codex builds, Gemini reviews, each reports back.'],
      ['Line them up.', 'Or give the same task to several agents and line up the diffs and test runs.'],
      ['Keep the best.', 'Merge one, archive the rest in a single click.'],
      ['See the whole tree.', 'Subagents, agent teams and workflows each get a row of their own.']
    ] satisfies Item[]
  },
  merge: {
    label: 'Merge',
    title: ['Branch out.', 'Merge in.'],
    steps: [
      ['Start', '⌘N', 'Pick a project, hit Return, and an agent gets to work.'],
      ['Work in parallel', '', 'Each agent gets its own worktree. Nobody steps on anybody.'],
      ['Spot conflicts early', '', 'Two agents touching the same code? You hear about it first.'],
      ['Review', '', 'Read the diff, or have an agent review it first.'],
      ['Merge', '⇧⌘M', 'A trial merge first. No conflicts, straight into main.'],
      ['Wrap up', '', 'The worktree goes, the branch stays.']
    ] satisfies [string, string, string][],
    still: 'Still — three strands, one braid.'
  },
  windows: {
    label: 'Windows',
    title: ['More screens,', 'more threads.'],
    items: [
      ['Split it.', 'Drag a session into the pane. Split, swap, resize.'],
      ['Tear it off.', 'Drag one out of the window and it becomes a window of its own.'],
      ['Leave it running.', 'Quit with ⌘Q and reopen tomorrow. Agents keep going, and pick up again when your quota resets.']
    ] satisfies Item[],
    still: 'Still — one mirror, three panels.'
  },
  wardrobe: {
    label: 'Wardrobe',
    title: ['Terminal or chat.', 'Glass or solid.'],
    items: [
      ['Per session.', 'Start each session in the terminal or as a chat. Wear both in one window.'],
      ['Your glass.', 'Liquid Glass or solid, with a picture of your own underneath.'],
      ['Your type.', 'One font for Latin, one for CJK. Bring a Ghostty or iTerm theme.']
    ] satisfies Item[],
    still: 'Still — one rail, two coats.'
  },
  ship: {
    label: 'Ship',
    title: ['Less git.', 'More building.'],
    items: [
      ['Issue in.', 'Hand an issue or a PR to an agent, straight from the board.'],
      ['One button each.', 'Commit, push, open the PR. The agent writes the message; you press ⌘↵.'],
      ['CI fails? Fine.', 'The agent fixes it and commits. Wavi checks, then pushes.'],
      ['Your call.', 'Nothing runs by itself until you switch it on.']
    ] satisfies Item[],
    still: 'Still — the last stitch.'
  },
  six: {
    label: 'Six pieces',
    items: [
      ['Custom looks', 'Make your workspace a pleasure to look at.'],
      ['Auto review', 'Quietly guards every merge while you’re deep in the work.'],
      ['Visual PRs', 'Keeps your head clear across a dozen threads.'],
      ['Auto resume', 'When your quota resets, stalled agents pick up where they left off.'],
      ['Visible conflicts', 'Two agents touching the same code? You’ll know before you merge.'],
      ['Hands off', 'No account, no telemetry. Your agent config stays yours.']
    ] satisfies Item[]
  },
  colophon: 'No account · No telemetry · MIT License',
  zoom: { close: 'Close' }
}

type Copy = typeof en

const zh: Copy = {
  htmlLang: 'zh-CN',
  meta: {
    title: 'Wavi — 一个人，多线程',
    description: 'Wavi 是给同时跑好几个 coding agent 的开发者做的 macOS 终端：每个 agent 一条分支，只在需要你时叫你。免费、开源、无遥测。'
  },
  skip: '跳到正文',
  bar: {
    home: 'Wavi，第一页',
    label: '栏目',
    status: '状态',
    merge: '合并',
    wardrobe: '衣橱',
    ship: '交付',
    download: '下载',
    other: 'EN',
    otherLabel: 'Switch to English'
  },
  issue: 'Wavi — 第一辑',
  cover: {
    kicker: '第一辑  ·  2026 秋冬',
    title: ['一个人，', '多线程。'],
    sub: '专为多线程、ADHD 选手打造的 coding terminal。',
    download: '下载 macOS 版',
    github: 'GitHub'
  },
  looks: [
    { name: '会话，浅色', caption: '会话，浅色。玻璃侧栏，打开一条线程。', alt: '浅色模式的 Wavi：玻璃侧栏里排着会话，打开的是一个 Claude Code 会话。' },
    { name: '总览，深色', caption: '总览，深色。八个会话，只有等你的那一个亮着。', alt: '深色模式的 Wavi：侧栏里的会话有一个标着在等你，旁边是正在跑的 agent。' },
    { name: '看板，深色', caption: '看板，深色。所有会话按状态排开。', alt: '深色模式的 Wavi 看板：会话卡片按状态分成几列。' },
    { name: '派活，浅色', caption: '派活，浅色。一个 agent 拆活，三个回来汇报。', alt: 'Wavi 的聊天会话：一个 agent 把三个任务派给其他 agent，画成分叉的图。' },
    { name: '并排，深色', caption: '并排，深色。一个窗口四个会话，另一个已经撕成单独的窗口。', alt: '深色模式的 Wavi：几个会话并排分屏，旁边是文件树。' },
    { name: 'GitHub，浅色', caption: 'GitHub，浅色。每个 issue 和 PR，点一下就交给 agent。', alt: '浅色模式的 Wavi GitHub 看板：两个项目的 issue 和 PR。' }
  ],
  index: { label: '目录', look: 'Look' },
  collection: {
    label: '关于这一辑',
    items: [
      ['抓住每一条线。', 'Claude Code、Codex 和另外十七家，各在各的分支上。等你的那一个会亮起来。'],
      ['按你的方式穿。', '每个会话自选终端或聊天。玻璃或实色，你的壁纸，你的字体。'],
      ['杂事交出去。', '提交、推送、修 CI，一处搞定。你不点头，什么都不会自己跑。']
    ]
  },
  status: {
    label: '状态',
    title: ['谁在等你？'],
    body: '跑着的、做完的、卡住的，各有各的样子。只有在等你的那一个会亮起来。按 ⌘J 跳过去。侧栏可以按状态分组，也可以在一块看板上看所有项目。',
    still: '静物 — 一扇亮着的窗。'
  },
  ensemble: {
    label: '合奏',
    title: ['一个任务，', '几双手。'],
    items: [
      ['分出去。', '让一个 agent 拆活：Codex 来写，Gemini 来审，各自回来汇报。'],
      ['摆一排。', '或者把同一个任务交给几个 agent，把 diff 和测试结果并排摆开。'],
      ['留最好的。', '合并一份，其余一键归档。'],
      ['看见整棵树。', 'Subagent、agent team 和 workflow 各占一行。']
    ]
  },
  merge: {
    label: '合并',
    title: ['分出去，', '合回来。'],
    steps: [
      ['开工', '⌘N', '选好项目，回车，一个 agent 就开工了。'],
      ['各干各的', '', '每个 agent 一个 worktree，谁也不碰谁。'],
      ['提前看到冲突', '', '两个 agent 改到同一处，先告诉你。'],
      ['审阅', '', '看 diff，或者让 agent 先自己审一遍。'],
      ['合并', '⇧⌘M', '先试合并，没冲突就合进主干。'],
      ['收尾', '', 'worktree 删掉，分支留着。']
    ],
    still: '静物 — 三股，一条辫。'
  },
  windows: {
    label: '窗口',
    title: ['多一块屏，', '多几条线。'],
    items: [
      ['分屏。', '把会话拖进窗格。分屏、交换、调大小。'],
      ['撕下来。', '把一个会话拖出窗口，它就成了独立的窗口。'],
      ['让它跑着。', '⌘Q 退出，明天再打开。agent 照常在跑，额度恢复后自己接着干。']
    ],
    still: '静物 — 一面镜子，三扇。'
  },
  wardrobe: {
    label: '衣橱',
    title: ['终端或聊天，', '玻璃或实色。'],
    items: [
      ['按会话选。', '每个会话可以开在终端里，也可以开成聊天。一个窗口里两种都能穿。'],
      ['你的玻璃。', 'Liquid Glass 或实色，底下垫一张你自己的图。'],
      ['你的字。', '拉丁字母一套字体，中日韩一套。Ghostty 或 iTerm 的主题直接带过来。']
    ],
    still: '静物 — 一根衣杆，两件大衣。'
  },
  ship: {
    label: '交付',
    title: ['少碰 git，', '多做东西。'],
    items: [
      ['Issue 进来。', '在看板上直接把 issue 或 PR 交给 agent。'],
      ['一步一个按钮。', '提交、推送、开 PR。说明由 agent 写，你按 ⌘↵。'],
      ['CI 挂了？没事。', 'agent 修好并提交，Wavi 检查一遍再推送。'],
      ['你说了算。', '你不打开，什么都不会自己跑。']
    ],
    still: '静物 — 最后一针。'
  },
  six: {
    label: '六件单品',
    items: [
      ['定制化外观', '让你的开发工作台更赏心悦目。'],
      ['自动化审阅', '在高强度开发中替你默默把关。'],
      ['可视化 PR', '在多线程开发中让你的思路更加清晰。'],
      ['自动化续跑', '额度一恢复，停下的 agent 自己接着干。'],
      ['可视化冲突', '两个 agent 改到同一处，合并前就提醒你。'],
      ['不碰你的配置', '没有账号，没有遥测，你的 agent 配置还是你的。']
    ]
  },
  colophon: '没有账号 · 没有遥测 · MIT 许可',
  zoom: { close: '关闭' }
}

export const copy: Record<Lang, Copy> = { en, zh }

/** Path of the same page in the other language, relative to the site base. */
export const otherPath = (lang: Lang): string => (lang === 'en' ? 'zh/' : '')

/** Roman numerals for the numbered features: (I) … (IV) on the pages, i. … vi. in the merge list. */
export const roman = (n: number): string => ['I', 'II', 'III', 'IV', 'V', 'VI'][n] ?? String(n + 1)
