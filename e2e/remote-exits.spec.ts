// Git · 变更's exits and 归档 from the phone (PRD F22, Figma 45I / 45J) through the real path: a stand-in phone
// (src/main/remote/test-phone.ts) asks which exits a worktree has (a move only the Mac runs, 提交, shows blocked with
// where it runs), starts 合并 (the branch is squashed into the local main, titled after the session, nothing written),
// then 推送 of main to origin, then archives the worktree. origin is a local bare repository, not GitHub, so 合并 is
// the only exit.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PhoneEvent, RemoteExits, RemoteSession, RemoteStatus } from '../src/shared/remote'
import { pairPhone, TestPhone } from '../src/main/remote/test-phone'
import { fakeHookClaude } from './fake-hook-claude'
import { launchApp, setWindowSize } from './launch'

const WITHIN = { timeout: 30_000 }

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      server.close(() => resolve(port))
    })
  })
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(120_000)

test.describe('手机 · Git 出口', () => {
  const profile = mkdtempSync(join(tmpdir(), 'tr-e2e-remote-exits-'))
  const fake = fakeHookClaude('tr-e2e-remote-exits-')
  const project = join(fake.root, 'demo')
  const clean = join(fake.root, 'wt-clean')
  const bare = join(fake.root, 'origin.git')
  let agent: ReturnType<typeof fake.folder>
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=e2e@example.com', '-c', 'user.name=e2e', '-c', 'commit.gpgsign=false', ...args], { cwd }).toString()
  let app: ElectronApplication
  let page: Page
  let phone: TestPhone

  /** The session as the latest list the phone got shows it. */
  const row = (event: PhoneEvent): RemoteSession | undefined => (event.event === 'sessions' ? event.data.sessions.find((s) => s.id === 's-clean') : undefined)
  const shipped = (match: (s: RemoteSession) => boolean) => phone.next((e) => (row(e) ? match(row(e)!) : false), 30_000).then(row)

  test.beforeAll(async () => {
    mkdirSync(project)
    mkdirSync(join(fake.root, 'claude-config'))
    writeFileSync(join(project, 'README.md'), '# demo\n')
    writeFileSync(join(project, '.gitignore'), '.fake-*\n')
    git(project, 'init', '-q', '-b', 'main')
    git(project, 'add', '.')
    git(project, 'commit', '-q', '-m', 'init')
    git(fake.root, 'init', '-q', '--bare', '-b', 'main', bare)
    git(project, 'remote', 'add', 'origin', bare)
    git(project, 'push', '-q', '-u', 'origin', 'main')
    git(project, 'worktree', 'add', '-q', '-b', 'jacob/clean', clean)
    git(project, 'config', 'branch.jacob/clean.base', 'main')
    agent = fake.folder('wt-clean')
    writeFileSync(join(clean, 'nav.ts'), "export const nav = 'sticky'\n")
    git(clean, 'add', '.')
    git(clean, 'commit', '-q', '-m', 'Make nav sticky')
    writeFileSync(
      join(profile, 'workspace.json'),
      JSON.stringify({
        version: 2,
        projects: [{ id: 'p1', name: 'demo', rootPath: project }],
        worktrees: [
          { id: 'w-main', projectId: 'p1', branch: 'main', path: project, isMain: true },
          { id: 'w-clean', projectId: 'p1', branch: 'jacob/clean', path: clean, isMain: false, baseBranch: 'main' }
        ],
        sessions: [{ id: 's-clean', worktreeId: 'w-clean', kind: 'claude', title: '导航吸顶', startedAt: 1, lastActivityAt: 1 }],
        activeSessionId: 's-clean',
        sidebarCollapsed: false,
        rightPanel: null,
        drafts: {}
      })
    )
    app = await launchApp({ ...fake.env, CLAUDE_CONFIG_DIR: join(fake.root, 'claude-config') }, { userDataDir: profile })
    page = await app.firstWindow()
    await page.waitForSelector('[data-region="sidebar"]')
    await setWindowSize(app, page, 1440, 900)
    await expect.poll(() => agent.pid(), WITHIN).not.toBeNull()

    const port = await freePort()
    const url = `ws://127.0.0.1:${port}`
    await page.evaluate((p) => (globalThis as unknown as { tr: { settings: { update(x: unknown): Promise<unknown> } } }).tr.settings.update({ remote: { enabled: true, port: p } }), port)
    let status: RemoteStatus | null = null
    await expect
      .poll(async () => {
        status = await page.evaluate(() => (globalThis as unknown as { tr: { remote: { status(): Promise<RemoteStatus> } } }).tr.remote.status())
        return status.listening && status.pairing !== null
      }, WITHIN)
      .toBe(true)
    const pairing = status!.pairing!
    const key = (JSON.parse(Buffer.from(pairing.link.slice('wavi://pair?d='.length), 'base64url').toString('utf8')) as { key: string }).key
    phone = await TestPhone.connect(url, await pairPhone(url, key, pairing.code, 'iPhone'))
  })

  test.afterAll(async () => {
    phone?.close()
    await app?.close().catch(() => {})
  })

  const exitsNow = async (): Promise<RemoteExits | string> => {
    const answer = await phone.request({ type: 'exits', session: 's-clean' }, 30_000)
    return answer.ok ? (answer.data as RemoteExits) : 'error'
  }
  const primaryNow = async () => {
    const exits = await exitsNow()
    return typeof exits === 'string' ? exits : exits.primary
  }

  test('the phone gets the exits Git · 变更 would offer; 提交, which only the Mac runs, shows blocked with where it runs', async () => {
    // A file to commit: 提交 is the primary, the exit beside it still runs from the phone.
    writeFileSync(join(clean, 'draft.ts'), 'export const draft = 1\n')
    await expect.poll(async () => (await primaryNow()) as unknown, WITHIN).toMatchObject({ kind: 'commit', label: '提交', blocker: expect.stringContaining('在 Mac 上提交') })
    expect(await exitsNow()).toMatchObject({ secondary: { kind: 'main', label: '合并', blocker: null } })
    rmSync(join(clean, 'draft.ts'))
    await expect.poll(primaryNow, WITHIN).toEqual({ kind: 'main', label: '合并', blocker: null })
    expect(await exitsNow()).toMatchObject({ secondary: null, pr: null, base: 'main' })
  })

  test('合并 from the phone: nothing to write or edit, main gets one squash commit titled after the session, nothing pushed; 推送 is next', async () => {
    const before = git(project, 'rev-parse', 'main').trim()
    expect(await phone.request({ type: 'ship', session: 's-clean', action: { do: 'start', exit: 'main' } }, 30_000)).toMatchObject({ ok: true })
    const done = await shipped((s) => s.ship === undefined && /已合并到 main/.test(s.shipNotice ?? ''))
    expect(done?.shipNotice).toMatch(/已合并到 main · [0-9a-f]{7}/)
    // Nothing waited for a glance: there is nothing to go ahead with.
    expect(await phone.request({ type: 'ship', session: 's-clean', action: { do: 'submit' } })).toMatchObject({ ok: false })
    expect(git(project, 'rev-list', '--count', `${before}..main`).trim()).toBe('1')
    expect(git(project, 'log', '-1', '--format=%B', 'main').trim()).toBe('导航吸顶\n\n- Make nav sticky')
    expect(existsSync(join(project, 'nav.ts'))).toBe(true)
    // Local only: origin still has the old main.
    expect(git(bare, 'rev-parse', 'refs/heads/main').trim()).toBe(before)
    await expect.poll(primaryNow, WITHIN).toEqual({ kind: 'push-base', label: '推送', blocker: null })
  })

  test('推送 from the phone: main goes to origin, and nothing is left to ship', async () => {
    expect(await phone.request({ type: 'ship', session: 's-clean', action: { do: 'start', exit: 'push-base' } }, 30_000)).toMatchObject({ ok: true })
    const done = await shipped((s) => s.ship === undefined && /已推送 main/.test(s.shipNotice ?? ''))
    expect(done?.shipNotice).toMatch(/已推送 main · [0-9a-f]{7}/)
    expect(git(bare, 'rev-parse', 'refs/heads/main').trim()).toBe(git(project, 'rev-parse', 'main').trim())
    await expect.poll(primaryNow, WITHIN).toBeNull()
  })

  test('归档 from the phone folds the worktree away and keeps its folder', async () => {
    await expect
      .poll(async () => {
        const answer = await phone.request({ type: 'exits', session: 's-clean' }, 30_000)
        return answer.ok ? (answer.data as RemoteExits).archive.blocker : 'error'
      }, WITHIN)
      .toBeNull()
    expect(await phone.request({ type: 'archive', session: 's-clean' }, 60_000)).toMatchObject({ ok: true })
    await phone.next((e) => e.event === 'sessions' && !e.data.sessions.some((s) => s.id === 's-clean'), 30_000)
    expect(existsSync(clean)).toBe(true)
  })
})
