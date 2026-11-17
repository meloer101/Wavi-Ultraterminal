/* Page copy in both languages. English is the default (served at "/"); Chinese lives at "/zh/".
   The layout is the Figma magazine W10 (spreads at 1440×900, phone pages at 390×844); English copy is W10's word for word.
   The plates are drawn in Figma from the app's own screens, in the app's own words for each language. */

export type Lang = 'en' | 'zh'

/** A numbered feature: "(I) Title." plus one line. */
export type Item = [title: string, body: string]
/** One plate (a drawn app screen): its index name, its caption and its alt text. */
export interface Plate {
  name: string
  caption: string
  alt: string
}
/** A chapter in the contents: its numeral, name and opening line. */
export type Chapter = [numeral: string, name: string, line: string]

const en = {
  htmlLang: 'en',
  meta: {
    title: 'Wavi — One person, many threads',
    description: 'Wavi is a macOS coding terminal for people who run several coding agents at once: each agent works on its own branch, agents hand work to each other, and Wavi only calls you when one needs you. Free, open source, no telemetry.'
  },
  skip: 'Skip to content',
  bar: {
    home: 'Wavi, first page',
    label: 'Sections',
    board: 'Board',
    ensemble: 'Ensemble',
    threads: 'Threads',
    ship: 'Ship',
    wardrobe: 'Wardrobe',
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
  plateWord: 'Plate',
  plates: [
    { name: 'Session, light', caption: 'Session, light. Your own picture under the glass; only the one waiting on you lights up.', alt: 'Wavi in light mode over a picture of mountains: a sidebar of sessions, one waiting on you, next to a running Claude Code session.' },
    { name: 'Board, dark', caption: 'Board, dark. Every project by status; the sessions that need you come first.', alt: 'Wavi’s board in dark mode: session cards in columns for needs you, error, to review, running and idle.' },
    { name: 'Leader, dark', caption: 'Hand-off, dark. The leader keeps Claude on the form, sends the e2e to Codex and takes over a session you opened.', alt: 'A leader session in Wavi’s terminal: the sidebar draws the sessions it dispatched as a tree, and a strip under the terminal asks you to start two more.' },
    { name: 'Hand-off, light', caption: 'Hand-off, light. One agent splits the job across Codex, Claude Code and Gemini CLI; the reports come back into the chat.', alt: 'A chat session in Wavi: one agent dispatches three sessions to Codex, Claude Code and Gemini CLI, drawn as a fan of lines, with a report card from Codex underneath.' },
    { name: 'Team, dark', caption: 'Team, dark. One lane per teammate: coder and reviewer pass the work back and forth; docs waits for you.', alt: 'A Claude Code agent team in Wavi: one lane per teammate along a time axis, with arrows for the messages between them.' },
    { name: 'Workflow, dark', caption: 'a workflow, phase by phase.', alt: 'A Claude workflow’s run card in Wavi: each phase with done out of total and time, and the agents of the running phase underneath.' },
    { name: 'Side by side, dark', caption: 'Side by side, dark. Two sessions and the files of one, in a single window.', alt: 'Wavi in dark mode with two terminal sessions side by side and a file tree on the right.' },
    { name: 'GitHub, light', caption: 'GitHub, light. Issues and pull requests for every project; hand one to an agent in a click.', alt: 'Wavi’s GitHub board in light mode: open issues and pull requests for two projects.' },
    { name: 'Issue to main', caption: 'Issue to main. Each step is one button; the agent does the writing, you do the deciding.', alt: 'Five panels in a row: the new session sheet with a GitHub issue as the task, the review before push, creating the PR, the PR’s checks with auto-fix, and the merge.' },
    { name: 'Four coats', caption: 'Four coats, one session: the default, your picture at 50%, the same picture blurred, and the settings that do it.', alt: 'The same Wavi session four ways: default, over a picture at 50%, over the same picture blurred, and the appearance settings.' }
  ] satisfies Plate[],
  contents: {
    label: 'Contents',
    plates: 'Plates',
    chapters: [
      ['I', 'Board', 'Who’s waiting?'],
      ['II', 'Ensemble', 'One task, many hands.'],
      ['III', 'Threads', 'More screens, more threads.'],
      ['IV', 'Ship', 'Less git. More building.'],
      ['V', 'Wardrobe', 'Terminal or chat. Glass or solid.']
    ] satisfies Chapter[]
  },
  board: {
    label: 'I  ·  Board',
    title: 'Who’s waiting?',
    body: 'Running, done, stuck: each looks different, in shape and in words. Only the one waiting on you lights up, and ⌘J jumps there.',
    items: [
      ['One board for every project.', 'Needs you, error, to review, running, idle. Each session is a card with its branch, its diff and the checks it ran.'],
      ['Look without leaving.', 'Press Space on a few cards and up to four live terminals open side by side.'],
      ['Called only when it matters.', 'The Dock counts who needs you. A notification names the session and what it asked, only when you can’t see it.']
    ] satisfies Item[],
    still: 'Still — one window lit.'
  },
  hand: {
    label: 'II  ·  Ensemble',
    title: ['One task,', 'many hands.'],
    items: [
      ['Hand it out.', 'Ask one agent to split the job. It sends the pieces to Codex, Gemini or any of the nineteen, each on a branch of its own.'],
      ['Hear back.', 'Every piece reports to the session that sent it. You confirm the first hand-off; the rest is theirs.'],
      ['A lead who never codes.', 'A leader session only hands out work. It takes over sessions you opened, after one yes.']
    ] satisfies Item[]
  },
  teams: {
    title: ['Their own', 'teams, too.'],
    items: [
      ['Subagents.', 'Claude Code’s subagents show up under the session that started them.'],
      ['Agent teams.', 'A Claude Code team gets lanes under its lead: who is on it, who passed what to whom, who is waiting on you.'],
      ['Workflows.', 'Every phase of a workflow is a row: done out of total, tokens, time.'],
      ['Same task, several hands.', 'Give one task to two to four agents, line up the diffs and test runs, keep the best.']
    ] satisfies Item[]
  },
  threads: {
    label: 'III  ·  Threads',
    title: ['More screens,', 'more threads.'],
    items: [
      ['Split it.', 'Drag a session into the window: up to four side by side. Split, swap, resize.'],
      ['Tear it off.', 'Drag one out and it becomes a window of its own, on any screen.'],
      ['Leave it running.', 'Quit with ⌘Q and reopen tomorrow; agents keep going. Claude and Codex pick up again when your quota resets.'],
      ['A branch each.', 'Every agent works in a worktree of its own. Two touching the same code? You hear before you merge.']
    ] satisfies Item[],
    still: 'Still — one mirror, three panels.'
  },
  ship: {
    label: 'IV  ·  Ship',
    title: ['Less git.', 'More building.'],
    items: [
      ['Issue in.', 'Hand an issue or a PR to an agent from the board. It gets a worktree and the task.'],
      ['One button at a time.', 'Commit, push or open the PR: one lit button. The agent writes the message; you press ⌘↵.'],
      ['Checked before it leaves.', 'With review before push on, what is about to go up gets reviewed first, and a P1 stops it.'],
      ['CI fails? Fine.', 'The agent fixes it and commits; Wavi checks, then pushes. Nothing runs by itself until you switch it on.']
    ] satisfies Item[]
  },
  chain: {
    title: 'From issue to main.',
    steps: ['Hand to agent', 'Review before push', 'Create PR', 'CI and auto-fix', 'Merge']
  },
  wardrobe: {
    label: 'V  ·  Wardrobe',
    title: ['Terminal or chat.', 'Glass or solid.'],
    items: [
      ['Per session.', 'Start each session in the terminal or as a chat. Wear both in one window.'],
      ['Your glass.', 'Liquid Glass or solid, from 20 to 100%. A picture of your own underneath, sharp or blurred.'],
      ['Your type.', 'One font for Latin, one for CJK. Bring a Ghostty or iTerm theme. Light or dark, English or Chinese.']
    ] satisfies Item[],
    tiles: ['Default · terminal 85%', 'Your picture · terminal 50%', 'Blurred · 50%, blur 40%', 'Appearance settings, light']
  },
  colophon: 'No account · No telemetry · Your agent config stays yours · MIT License',
  zoom: { close: 'Close' }
}

type Copy = typeof en

const zh: Copy = {
  htmlLang: 'zh-CN',
  meta: {
    title: 'Wavi — 一个人，多线程',
    description: 'Wavi 是给同时跑好几个 coding agent 的开发者做的 macOS 终端：每个 agent 一条分支，agent 之间互相派活，只在需要你时叫你。免费、开源、无遥测。'
  },
  skip: '跳到正文',
  bar: {
    home: 'Wavi，第一页',
    label: '栏目',
    board: '看板',
    ensemble: '合奏',
    threads: '多线程',
    ship: '交付',
    wardrobe: '衣橱',
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
  plateWord: 'Plate',
  plates: [
    { name: '会话，浅色', caption: '会话，浅色。玻璃底下垫着你自己的图；只有等你的那一个亮着。', alt: '浅色模式的 Wavi 垫着一张山景图：侧栏里排着会话，有一个在等你，旁边是正在跑的 Claude Code 会话。' },
    { name: '看板，深色', caption: '看板，深色。所有项目按状态排开，需要你的排在最前。', alt: '深色模式的 Wavi 看板：会话卡片分成等你处理、出错、待审阅、运行中、空闲几列。' },
    { name: 'Leader，深色', caption: '派活，深色。leader 让 Claude 改表单，把 e2e 派给 Codex，再接管一个你开的会话。', alt: 'Wavi 终端里的 leader 会话：侧栏把它派出的会话画成一棵树，终端下方的确认条请你开始另外两个。' },
    { name: '派活，浅色', caption: '派活，浅色。一个 agent 把活拆给 Codex、Claude Code 和 Gemini CLI，报告回到对话里。', alt: 'Wavi 的聊天会话：一个 agent 把三个会话派给 Codex、Claude Code 和 Gemini CLI，画成扇形的连线，下面是 Codex 发回的报告卡片。' },
    { name: '队伍，深色', caption: '队伍，深色。每个队友一条泳道：coder 和 reviewer 来回传，docs 在等你。', alt: 'Wavi 里的 Claude Code agent team：沿时间轴每个队友一条泳道，箭头是他们之间的消息。' },
    { name: 'Workflow，深色', caption: '一个 workflow，按 phase 一行一行。', alt: 'Wavi 里 Claude workflow 的运行卡：每个 phase 写着完成数和耗时，正在跑的 phase 下面列出各个 agent。' },
    { name: '并排，深色', caption: '并排，深色。一个窗口里两个会话，加上其中一个的文件。', alt: '深色模式的 Wavi：两个终端会话并排，右边是文件树。' },
    { name: 'GitHub，浅色', caption: 'GitHub，浅色。每个项目的 issue 和 PR，点一下就交给 agent。', alt: '浅色模式的 Wavi GitHub 看板：两个项目打开的 issue 和 PR。' },
    { name: '从 issue 到 main', caption: '从 issue 到 main。每一步一个按钮：agent 负责写，你负责拍板。', alt: '五块面板排成一行：任务是 GitHub issue 的新建会话面板、推送前审阅、创建 PR、PR 的检查和自动修复、合并。' },
    { name: '四件外套', caption: '同一个会话，四件外套：默认、你的图 50%、同一张图加模糊，以及做这些的设置。', alt: '同一个 Wavi 会话的四种样子：默认、垫着一张图 50%、同一张图加模糊、外观设置。' }
  ],
  contents: {
    label: '目录',
    plates: '图版',
    chapters: [
      ['I', '看板', '谁在等你？'],
      ['II', '合奏', '一个任务，几双手。'],
      ['III', '多线程', '多一块屏，多几条线。'],
      ['IV', '交付', '少碰 git，多做东西。'],
      ['V', '衣橱', '终端或聊天，玻璃或实色。']
    ]
  },
  board: {
    label: 'I  ·  看板',
    title: '谁在等你？',
    body: '跑着的、做完的、卡住的，形状和文字都不一样。只有在等你的那一个会亮起来，按 ⌘J 跳过去。',
    items: [
      ['一块看板看所有项目。', '等你处理、出错、待审阅、运行中、空闲。每个会话一张卡片，写着分支、改动量和这一轮跑过的检查。'],
      ['不离开看板就能看。', '在几张卡片上按空格，最多四个实时终端并排打开。'],
      ['只在要紧时叫你。', 'Dock 角标数着谁在等你。通知写明是哪个会话、问了什么，而且只在你看不见它时才发。']
    ],
    still: '静物 — 一扇亮着的窗。'
  },
  hand: {
    label: 'II  ·  合奏',
    title: ['一个任务，', '几双手。'],
    items: [
      ['分出去。', '让一个 agent 拆活，把各块交给 Codex、Gemini 或另外十七家里的任何一家，各在各的分支上。'],
      ['等回音。', '每一块都向派它的会话汇报。第一层派活由你确认，之后交给它们。'],
      ['不写代码的 leader。', 'leader 会话只派活。你点一次头，它就能接管你自己开的会话。']
    ]
  },
  teams: {
    title: ['自带的队伍，', '也看得见。'],
    items: [
      ['Subagent。', 'Claude Code 的 subagent 挂在启动它的会话下面。'],
      ['Agent team。', 'Claude Code 的队伍在 lead 下面一人一条泳道：谁在队里、谁把什么传给了谁、谁在等你。'],
      ['Workflow。', 'workflow 每个 phase 一行：完成数 / 总数、token、耗时。'],
      ['同一个任务，几双手。', '把一个任务交给两到四个 agent，diff 和测试结果并排摆开，留最好的。']
    ]
  },
  threads: {
    label: 'III  ·  多线程',
    title: ['多一块屏，', '多几条线。'],
    items: [
      ['分屏。', '把会话拖进窗口，最多四个并排。分屏、交换、调大小。'],
      ['撕下来。', '把一个拖出去，它就成了独立的窗口，放到哪块屏都行。'],
      ['让它跑着。', '⌘Q 退出，明天再打开，agent 照常在跑。Claude 和 Codex 在额度恢复后自己接着干。'],
      ['一人一条分支。', '每个 agent 在自己的 worktree 里干活。两个改到同一处？合并前就先告诉你。']
    ],
    still: '静物 — 一面镜子，三扇。'
  },
  ship: {
    label: 'IV  ·  交付',
    title: ['少碰 git，', '多做东西。'],
    items: [
      ['Issue 进来。', '在看板上把 issue 或 PR 交给 agent，它会拿到一个 worktree 和任务。'],
      ['一次亮一个按钮。', '提交、推送或开 PR：只亮一个按钮。说明由 agent 写，你按 ⌘↵。'],
      ['出门前先审。', '打开推送前审阅后，要推上去的提交先审一遍，发现 P1 就停下。'],
      ['CI 挂了？没事。', 'agent 修好并提交，Wavi 检查一遍再推送。你不打开，什么都不会自己跑。']
    ]
  },
  chain: {
    title: '从 issue 到 main。',
    steps: ['交给 agent', '推送前审阅', '创建 PR', 'CI 和自动修复', '合并']
  },
  wardrobe: {
    label: 'V  ·  衣橱',
    title: ['终端或聊天，', '玻璃或实色。'],
    items: [
      ['按会话选。', '每个会话可以开在终端里，也可以开成聊天。一个窗口里两种都能穿。'],
      ['你的玻璃。', 'Liquid Glass 或实色，从 20% 到 100%。底下垫一张你自己的图，清晰或模糊。'],
      ['你的字。', '拉丁字母一套字体，中日韩一套。Ghostty 或 iTerm 的主题直接带过来。浅色或深色，中文或英文。']
    ],
    tiles: ['默认 · 终端 85%', '你的图 · 终端 50%', '模糊 · 50%，模糊 40%', '外观设置']
  },
  colophon: '没有账号 · 没有遥测 · 不碰你的 agent 配置 · MIT 许可',
  zoom: { close: '关闭' }
}

export const copy: Record<Lang, Copy> = { en, zh }

/** Path of the same page in the other language, relative to the site base. */
export const otherPath = (lang: Lang): string => (lang === 'en' ? 'zh/' : '')

/** Roman numerals for the numbered features: (I) … (IV) on the pages, i. … v. in the chain. */
export const roman = (n: number): string => ['I', 'II', 'III', 'IV', 'V', 'VI'][n] ?? String(n + 1)
