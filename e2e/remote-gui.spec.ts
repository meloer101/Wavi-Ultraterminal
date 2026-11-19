// 手机远程 and GUI sessions (PRD F22 / F23): a session the phone starts runs as a GUI session whenever its agent has one,
// so the phone's 会话设置 (model, effort, 模式) are the agent's own pickers from the start — before the first message —
// and change by button, not by typing into a TUI; a first message typed in 新建会话 still reaches the agent. A restored
// GUI session nobody has shown yet starts when the phone opens it (PRD F22 v1.161). And the GUI session's prompts
// (PRD F22 v1.220 ①): the phone answers the permission, question and plan the agent asks, with the same GuiAnswer the
// desktop card sends, so the agent goes on and the Mac's card closes (and the other way round). Against the fake
// headless Claude, Codex and ACP agent of src/main/gui/fixtures, through the stand-in phone (test-phone.ts).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RemotePrompt, RemoteSession, RemoteStatus } from '../src/shared/remote'
import { pairPhone, TestPhone } from '../src/main/remote/test-phone'
import { outerClaudeEnv } from './fake-claude'
import { launchApp, setWindowSize } from './launch'

const WITHIN = { timeout: 20_000 }
const SOON = { timeout: 1_000 }
const FIXTURES = join(process.cwd(), 'src', 'main', 'gui', 'fixtures')

interface Hooks {
  tr: { settings: { update(patch: unknown): Promise<unknown> }; ui: { openSettings(): void }; remote: { status(): Promise<RemoteStatus> } }
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      server.close(() => resolve(port))
    })
  })
}

const macKey = (link: string): string => (JSON.parse(Buffer.from(link.slice('wavi://pair?d='.length), 'base64url').toString('utf8')) as { key: string }).key

test.describe('手机远程 · GUI sessions', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(120_000)

  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tr-e2e-remote-gui-')))
  const bin = join(root, 'bin')
  const zdot = join(root, 'zdot')
  const project = join(root, 'demo')
  const profile = join(root, 'profile')
  const argsFile = join(root, 'claude-args.json')
  for (const dir of [bin, zdot, project, profile]) mkdirSync(dir)
  for (const [name, fake] of [['claude', 'fake-claude.mjs'], ['codex', 'fake-codex.mjs'], ['grok', 'fake-acp.mjs']] as const) {
    writeFileSync(join(bin, name), `#!/bin/sh\nexec "${process.execPath}" "${join(FIXTURES, fake)}" "$@"\n`)
    chmodSync(join(bin, name), 0o755)
  }
  writeFileSync(join(zdot, '.zshrc'), `export PATH="${bin}:$PATH"\nexport FAKE_ARGS_FILE="${argsFile}"\n`)

  let app: ElectronApplication
  let page: Page
  let phone: TestPhone
  let created: string

  /** The arguments the fake Claude was last started with: a GUI session runs it headless (`-p`, stream-json). */
  const launchedArgs = (): string[] => (existsSync(argsFile) ? (JSON.parse(readFileSync(argsFile, 'utf8')) as { args: string[] }).args : [])
  const phoneRow = async (id: string): Promise<RemoteSession | undefined> => {
    const answer = await phone.request({ type: 'snapshot' })
    return answer.ok ? (answer.data as { sessions: RemoteSession[] }).sessions.find((s) => s.id === id) : undefined
  }
  const kinds = async (id: string) => (await phoneRow(id))?.settings?.items.map((i) => i.kind) ?? []
  const current = async (id: string, kind: string) => (await phoneRow(id))?.settings?.items.find((i) => i.kind === kind)?.current
  /** Everything the phone would draw as a sheet or put in the Live Activity, as of now. */
  const phonePrompts = async (): Promise<RemotePrompt[]> => {
    const answer = await phone.request({ type: 'snapshot' })
    return answer.ok ? ((answer.data as { prompts: RemotePrompt[] }).prompts ?? []) : []
  }
  type Prompt<K extends RemotePrompt['kind']> = Extract<RemotePrompt, { kind: K }>
  const promptOf = async (sessionId: string, kind: RemotePrompt['kind']) => (await phonePrompts()).find((p) => p.sessionId === sessionId && p.kind === kind)
  /** A prompt for the session with that kind, once the phone's list has it. */
  const waitPrompt = async <K extends RemotePrompt['kind']>(sessionId: string, kind: K): Promise<Prompt<K>> => {
    let found: Prompt<K> | undefined
    await expect.poll(async () => (found = (await promptOf(sessionId, kind)) as Prompt<K> | undefined)?.id, WITHIN).toBeTruthy()
    return found!
  }
  /** The session's conversation in the Mac's window (opening it there), whose card a prompt shows as. */
  const showOnMac = async (id: string) => {
    const row = page.locator(`[data-region="sidebar"] [data-session-id="${id}"]`)
    await row.click()
    await expect(row).toHaveAttribute('aria-current', 'true', WITHIN)
    await expect(page.getByTestId('gui-composer')).toBeVisible(WITHIN)
  }
  const card = () => page.getByTestId('gui-permission')
  const planCard = () => page.getByTestId('gui-plan')
  const feed = () => page.locator('[data-region="gui-feed"]')
  const send = (id: string, text: string) => phone.request({ type: 'send', session: id, text, photos: [] })

  test.beforeAll(async () => {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project })
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: project })
    // s1: a GUI session restored from disk that no window shows (s0 is the one shown), so nothing has started it.
    writeFileSync(
      join(profile, 'workspace.json'),
      JSON.stringify({
        version: 2,
        projects: [{ id: 'p1', name: 'demo', rootPath: project }],
        worktrees: [{ id: 'w-main', projectId: 'p1', branch: 'main', path: project, isMain: true }],
        sessions: [
          { id: 's0', worktreeId: 'w-main', kind: 'claude', ui: 'gui', title: '看着的会话', startedAt: 1, lastActivityAt: 2 },
          { id: 's1', worktreeId: 'w-main', kind: 'claude', ui: 'gui', title: '旧会话', startedAt: 1, lastActivityAt: 1 }
        ],
        activeSessionId: 's0',
        sidebarCollapsed: false,
        drafts: {}
      })
    )
    app = await launchApp({ ...outerClaudeEnv(), ZDOTDIR: zdot, SHELL: '/bin/zsh', CLAUDE_CONFIG_DIR: join(root, 'claude-config') }, { userDataDir: profile })
    page = await app.firstWindow()
    await page.waitForSelector('[data-region="sidebar"]')
    await setWindowSize(app, page, 1440, 900)
    const port = await freePort()
    await page.evaluate((p) => (globalThis as unknown as Hooks).tr.settings.update({ remote: { port: p } }), port)
    await page.evaluate(() => (globalThis as unknown as Hooks).tr.ui.openSettings())
    await page.getByRole('tab', { name: '手机' }).click()
    await page.getByRole('switch', { name: '允许手机连接' }).click()
    await expect.poll(async () => (await page.evaluate(() => (globalThis as unknown as Hooks).tr.remote.status())).pairing?.code, WITHIN).toBeTruthy()
    const status = await page.evaluate(() => (globalThis as unknown as Hooks).tr.remote.status())
    const url = `ws://127.0.0.1:${port}`
    phone = await TestPhone.connect(url, await pairPhone(url, macKey(status.pairing!.link), status.pairing!.code))
    await page.keyboard.press('Escape')
  })

  test.afterAll(async () => {
    phone?.close()
    await app?.close().catch(() => {})
  })

  test('a session the phone starts is a GUI session with model, effort and 模式 before anything is said', async () => {
    // The window publishes its sessions a moment after the phone connects.
    await expect.poll(async () => ((await phone.request({ type: 'snapshot' })) as { data?: { projects: { id: string }[] } }).data?.projects.map((p) => p.id), WITHIN).toEqual(['p1'])
    const answer = await phone.request({ type: 'new-session', project: 'p1', workdir: 'worktree', agent: 'claude', base: 'main', branch: 'phone-gui' }, 30_000)
    expect(answer).toMatchObject({ ok: true, data: { session: expect.any(String) } })
    created = (answer as { data: { session: string } }).data.session
    await expect.poll(() => kinds(created), WITHIN).toEqual(['model', 'effort', 'permission'])
    expect(launchedArgs()).toEqual(expect.arrayContaining(['-p', 'stream-json']))
  })

  test('the phone changes the model within the agent, the effort and the 模式 by button', async () => {
    const row = await phoneRow(created)
    expect(row?.settings?.locked).toBeUndefined()
    expect(row?.settings?.items.find((i) => i.kind === 'model')?.values.map((v) => v.value)).toContain('haiku')
    expect(await phone.request({ type: 'set-setting', session: created, kind: 'model', value: 'haiku' })).toMatchObject({ ok: true })
    await expect.poll(() => current(created, 'model'), WITHIN).toBe('haiku')
    expect(await phone.request({ type: 'set-setting', session: created, kind: 'model', value: 'opus' })).toMatchObject({ ok: true })
    await expect.poll(() => current(created, 'model'), WITHIN).toBe('opus')
    expect(await phone.request({ type: 'set-setting', session: created, kind: 'effort', value: 'low' })).toMatchObject({ ok: true })
    await expect.poll(() => current(created, 'effort'), WITHIN).toBe('low')
    expect(await phone.request({ type: 'set-setting', session: created, kind: 'permission', value: 'accept-edits' })).toMatchObject({ ok: true })
    await expect.poll(() => current(created, 'permission'), WITHIN).toBe('accept-edits')
    expect(await phone.request({ type: 'set-setting', session: created, kind: 'permission', value: 'plan' })).toMatchObject({ ok: true })
    await expect.poll(() => current(created, 'permission'), WITHIN).toBe('plan')
  })

  test('新建会话 lists the agent\'s models and the session starts with the one picked (Figma 67A / 67B)', async () => {
    const listed = await phone.request({ type: 'agent-models', agent: 'claude' }, 30_000)
    expect(listed).toMatchObject({ ok: true, data: { gui: true } })
    const models = (listed as { data: { models: { value: string }[] } }).data.models.map((m) => m.value)
    expect(models).toEqual(expect.arrayContaining(['opus', 'haiku']))
    const answer = await phone.request({ type: 'new-session', project: 'p1', workdir: 'worktree', agent: 'claude', base: 'main', branch: 'phone-haiku', model: 'haiku' }, 30_000)
    expect(answer).toMatchObject({ ok: true })
    const id = (answer as { data: { session: string } }).data.session
    await expect.poll(() => current(id, 'model'), WITHIN).toBe('haiku')
    expect(launchedArgs()).toEqual(expect.arrayContaining(['--model', 'haiku']))
    // The agent's next session starts with it too, as a pick in the desktop's menu does.
    expect((await phone.request({ type: 'agent-models', agent: 'claude' })) as unknown).toMatchObject({ ok: true, data: { current: 'haiku' } })
  })

  test('a first message typed in 新建会话 reaches the GUI agent, started with the model picked', async () => {
    const answer = await phone.request({ type: 'new-session', project: 'p1', workdir: 'worktree', agent: 'claude', base: 'main', branch: 'phone-first', prompt: 'from the phone', model: 'haiku' }, 30_000)
    expect(answer).toMatchObject({ ok: true })
    const id = (answer as { data: { session: string } }).data.session
    // The agent got it as the conversation's first message: the Mac's chat shows its answer.
    await page.locator(`[data-region="sidebar"] [data-session-id="${id}"]`).click()
    await expect(page.locator('[data-region="gui-feed"]')).toContainText('Hello: from the phone', WITHIN)
    expect(launchedArgs()).toEqual(expect.arrayContaining(['--model', 'haiku']))
  })

  test('a restored GUI session nobody has shown starts when the phone opens it', async () => {
    expect(await kinds('s1')).toEqual([])
    expect(await phone.request({ type: 'watch', session: 's1' })).toMatchObject({ ok: true })
    // It starts with the agent's last pick (Haiku, from 新建会话 above), which has no effort levels: no effort row.
    await expect.poll(() => kinds('s1'), WITHIN).toEqual(['model', 'permission'])
    expect(await current('s1', 'model')).toBe('haiku')
  })

  // PRD F22 v1.220 ①, acceptance ⑨: the GUI session's own prompts (no hook is held for them), answered with the same
  // GuiAnswer the desktop card sends — whichever side answers first, the other's card goes.
  test('the phone allows a GUI permission: the agent goes on and the Mac’s card closes', async () => {
    await showOnMac(created)
    expect(await send(created, 'please write a file')).toMatchObject({ ok: true })
    await expect(card()).toBeVisible(WITHIN)
    const prompt = await waitPrompt(created, 'permission')
    // A GUI prompt is answerable while it is open: nothing is held for it, the driver takes the answer.
    expect(prompt).toMatchObject({ kind: 'permission', tool: 'Write', summary: 'a.txt', answerable: true, canAllowAlways: true })
    expect(prompt.input).toEqual({ file_path: 'a.txt' })
    expect(await phone.request({ type: 'permission', prompt: prompt.id, decision: 'allow-once' })).toMatchObject({ ok: true })
    // The Mac's card closes as it does for a click on it, and the phone's list drops the ask.
    await expect(card()).toHaveCount(0, SOON)
    await expect.poll(() => phonePrompts(), SOON).toEqual([])
    // The agent went on with the turn.
    await expect(feed()).toContainText('Wrote it', WITHIN)
  })

  test('the phone denies a GUI permission with a reason: the agent gets it and the turn goes on', async () => {
    await showOnMac(created)
    expect(await send(created, 'please write another file')).toMatchObject({ ok: true })
    await expect(card()).toBeVisible(WITHIN)
    const prompt = await waitPrompt(created, 'permission')
    expect(await phone.request({ type: 'permission', prompt: prompt.id, decision: 'deny', message: '改完再跑' })).toMatchObject({ ok: true })
    await expect(card()).toHaveCount(0, SOON)
    await expect.poll(() => phonePrompts(), SOON).toEqual([])
    // The reason reached the agent, as the reason written on the Mac's card does: the fake prints it as the call's
    // result, which the tool row shows when it opens.
    await expect(feed()).toContainText('Refused', WITHIN)
    await feed().getByRole('button', { name: /写入 a\.txt/ }).last().click()
    await expect(feed().locator('pre').filter({ hasText: '改完再跑' })).toBeVisible(WITHIN)
  })

  test('the Mac answers first: the phone’s panel goes within 1 s and can no longer answer it', async () => {
    await showOnMac(created)
    expect(await send(created, 'please write one more')).toMatchObject({ ok: true })
    await expect(card()).toBeVisible(WITHIN)
    const prompt = await waitPrompt(created, 'permission')
    await card().getByRole('button', { name: /^允许/ }).click()
    await expect.poll(() => phonePrompts(), SOON).toEqual([])
    await expect(card()).toHaveCount(0, WITHIN)
    expect(await phone.request({ type: 'permission', prompt: prompt.id, decision: 'allow-once' })).toMatchObject({ ok: false })
    await expect(feed()).toContainText('Wrote it', WITHIN)
  })

  test('the phone answers a GUI question: the agent goes on with the answers', async () => {
    await showOnMac(created)
    expect(await send(created, 'ask me about the database')).toMatchObject({ ok: true })
    const prompt = await waitPrompt(created, 'question')
    expect(prompt.questions?.map((q) => q.question)).toEqual(['用哪个数据库', '要哪些检查'])
    expect(prompt.answerable).toBe(true)
    expect(await phone.request({ type: 'answer', prompt: prompt.id, answers: { 用哪个数据库: 'Postgres', 要哪些检查: 'lint' } })).toMatchObject({ ok: true })
    await expect(card()).toHaveCount(0, SOON)
    await expect.poll(() => phonePrompts(), SOON).toEqual([])
    await expect(feed()).toContainText('Wrote it', WITHIN)
  })

  test('the phone approves a GUI plan (批准并自动接受编辑): the agent goes on and the Mac’s plan card closes', async () => {
    await showOnMac(created)
    expect(await send(created, 'plan next')).toMatchObject({ ok: true })
    const prompt = await waitPrompt(created, 'plan')
    // The plan itself reaches the phone (Figma 100's sheet is not drawn yet; the data path is in place).
    expect(prompt.plan).toContain('Set-Cookie')
    expect(prompt.answerable).toBe(true)
    await expect(planCard()).toBeVisible(WITHIN)
    expect(await phone.request({ type: 'plan', prompt: prompt.id, decision: 'approve-auto' })).toMatchObject({ ok: true })
    // Both cards go at once (the driver settles the ask), and the plan's mode switch took effect for the session.
    await expect(planCard()).toHaveCount(0, SOON)
    await expect.poll(() => phonePrompts(), SOON).toEqual([])
    await expect.poll(() => current(created, 'permission'), WITHIN).toBe('accept-edits')
    await expect(feed()).toContainText('Wrote it', WITHIN)
  })

  test('the phone keeps planning: the reason reaches the agent and the session stays in plan mode', async () => {
    // Plan mode first, as the Mac's own 模式 menu would put it there.
    expect(await phone.request({ type: 'set-setting', session: created, kind: 'permission', value: 'plan' })).toMatchObject({ ok: true })
    await expect.poll(() => current(created, 'permission'), WITHIN).toBe('plan')
    await showOnMac(created)
    expect(await send(created, 'plan next again')).toMatchObject({ ok: true })
    const prompt = await waitPrompt(created, 'plan')
    expect(await phone.request({ type: 'plan', prompt: prompt.id, decision: 'keep-planning', message: '先把测试补上' })).toMatchObject({ ok: true })
    await expect(planCard()).toHaveCount(0, SOON)
    await expect.poll(() => phonePrompts(), SOON).toEqual([])
    // Still planning: 继续规划 leaves the mode alone.
    expect(await current(created, 'permission')).toBe('plan')
    await expect(feed()).toContainText('Refused', WITHIN)
  })

  test('a Codex GUI session’s approval is answered from the phone', async () => {
    const answer = await phone.request({ type: 'new-session', project: 'p1', workdir: 'worktree', agent: 'codex', base: 'main', branch: 'phone-codex' }, 30_000)
    expect(answer).toMatchObject({ ok: true })
    const id = (answer as { data: { session: string } }).data.session
    await showOnMac(id)
    // Its pickers are in once `codex app-server` has initialized: the agent takes a message from then on.
    await expect.poll(() => kinds(id), WITHIN).not.toEqual([])
    expect(await send(id, 'run a command')).toMatchObject({ ok: true })
    // Codex asks through `item/commandExecution/requestApproval` (a `GuiPrompt`, not a hook).
    const prompt = await waitPrompt(id, 'permission')
    expect(prompt).toMatchObject({ kind: 'permission', tool: 'Bash', summary: 'ls', answerable: true, canAllowAlways: true })
    expect(await phone.request({ type: 'permission', prompt: prompt.id, decision: 'allow-once' })).toMatchObject({ ok: true })
    await expect(card()).toHaveCount(0, SOON)
    await expect.poll(() => phonePrompts(), SOON).toEqual([])
    await expect(feed()).toContainText('Done', WITHIN)
  })

  test('two Codex GUI sessions ask at once: answering one leaves the other’s answerable', async () => {
    const start = async (branch: string): Promise<string> => {
      const answer = await phone.request({ type: 'new-session', project: 'p1', workdir: 'worktree', agent: 'codex', base: 'main', branch }, 30_000)
      expect(answer).toMatchObject({ ok: true })
      const id = (answer as { data: { session: string } }).data.session
      await expect.poll(() => kinds(id), WITHIN).not.toEqual([])
      return id
    }
    const first = await start('phone-codex-a')
    const second = await start('phone-codex-b')
    expect(await send(first, 'run a command')).toMatchObject({ ok: true })
    expect(await send(second, 'run a command')).toMatchObject({ ok: true })
    const a = await waitPrompt(first, 'permission')
    const b = await waitPrompt(second, 'permission')
    // Both app-servers number their first request the same way; the phone must still tell the two apart.
    expect(a.id).not.toBe(b.id)
    expect(a.id.split(':').pop()).toBe(b.id.split(':').pop())
    expect(await phone.request({ type: 'permission', prompt: a.id, decision: 'allow-once' })).toMatchObject({ ok: true })
    // Only the answered session goes on: the other still waits, and its prompt can still be answered.
    await expect.poll(async () => (await promptOf(first, 'permission'))?.id, WITHIN).toBeUndefined()
    const waiting = await promptOf(second, 'permission')
    expect(waiting?.id).toBe(b.id)
    expect(waiting?.answerable).toBe(true)
    expect(await phone.request({ type: 'permission', prompt: b.id, decision: 'allow-once' })).toMatchObject({ ok: true })
    await expect.poll(() => phonePrompts(), SOON).toEqual([])
  })

  test('an ACP GUI session’s permission is answered from the phone', async () => {
    const answer = await phone.request({ type: 'new-session', project: 'p1', workdir: 'worktree', agent: 'grok', base: 'main', branch: 'phone-acp' }, 30_000)
    expect(answer).toMatchObject({ ok: true })
    const id = (answer as { data: { session: string } }).data.session
    await showOnMac(id)
    // `session/new` brought its pickers: the agent takes a message from then on.
    await expect.poll(() => kinds(id), WITHIN).not.toEqual([])
    expect(await send(id, 'run ls')).toMatchObject({ ok: true })
    // An ACP agent offers its own options (`allow_once` / `reject_once` here, no 总是允许).
    const prompt = await waitPrompt(id, 'permission')
    expect(prompt).toMatchObject({ kind: 'permission', tool: 'Bash', summary: 'ls', answerable: true, canAllowAlways: false })
    // 总是允许 was not offered: the phone's button says so, rather than that someone else answered it.
    expect(await phone.request({ type: 'permission', prompt: prompt.id, decision: 'allow-always' })).toMatchObject({ ok: false, error: '这个请求没有这个选项' })
    expect(await phone.request({ type: 'permission', prompt: prompt.id, decision: 'allow-once' })).toMatchObject({ ok: true })
    await expect(card()).toHaveCount(0, SOON)
    await expect.poll(() => phonePrompts(), SOON).toEqual([])
    await expect(feed()).toContainText('a.txt', WITHIN)
  })
})
