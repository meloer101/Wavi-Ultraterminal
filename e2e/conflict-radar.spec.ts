// Conflict radar on a real repository with three worktrees and a fake `claude` in each: jacob/a and jacob/b edit the
// same README line (they conflict with each other), jacob/c edits another file. 看板's overlay
// title bar says "和 jacob/b 会冲突"; after a squash merge of jacob/a into main (by hand, in the main checkout) jacob/b
// would conflict with main and jacob/c is behind it; 让 agent rebase in the Worktree view puts the rebase note into
// jacob/b's agent input line without pressing Enter. Screenshots in both themes go to test-results/conflict-radar/.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fakeClaude } from './fake-claude'
import { launchApp, setWindowSize } from './launch'

const SHOTS = join(process.cwd(), 'test-results', 'conflict-radar')
const WITHIN = { timeout: 30_000 }
const README = ['# demo', '', 'one', 'two', 'three', 'four', 'five', ''].join('\n')

function setup() {
  const fake = fakeClaude('tr-e2e-radar-')
  const project = join(fake.root, 'demo')
  const paths = { a: join(fake.root, 'wt-a'), b: join(fake.root, 'wt-b'), c: join(fake.root, 'wt-c') }
  mkdirSync(project)
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=e2e@example.com', '-c', 'user.name=e2e', '-c', 'commit.gpgsign=false', ...args], { cwd }).toString()
  const commitIn = (cwd: string, file: string, text: string, message: string) => {
    writeFileSync(join(cwd, file), text)
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-q', '-m', message)
  }
  git(project, 'init', '-q', '-b', 'main')
  writeFileSync(join(project, 'notes.md'), 'notes\n')
  commitIn(project, 'README.md', README, 'init')
  for (const [name, path] of Object.entries(paths)) {
    git(project, 'worktree', 'add', '-q', '-b', `jacob/${name}`, path)
    git(project, 'config', `branch.jacob/${name}.base`, 'main')
  }
  commitIn(paths.a, 'README.md', README.replace('three', 'three from a'), 'a edits three')
  commitIn(paths.b, 'README.md', README.replace('three', 'three from b'), 'b edits three')
  commitIn(paths.c, 'notes.md', 'notes from c\n', 'c edits notes')
  return { ...fake, project, ...paths, git }
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(90_000)

test.describe('conflict radar', () => {
  const profile = mkdtempSync(join(tmpdir(), 'tr-e2e-radar-profile-'))
  const repo = setup()
  let app: ElectronApplication
  let page: Page

  const overview = () => page.locator('[data-region="overview"]')
  /** The mark in a session's overlay title bar on 看板 · 进度. */
  const barTag = (id: string) => page.locator(`[data-pane-id="${id}"] header [data-testid="radar-tag"]`)
  const closeBar = async (id: string) => {
    await page.locator(`[data-pane-id="${id}"]`).getByRole('button', { name: '关闭' }).click()
    await expect(page.locator('[data-region="overview-overlay"]')).toBeHidden()
  }
  const panel = () => page.locator('[data-region="panel"]')
  const setTheme = async (theme: 'dark' | 'light') => {
    await page.evaluate(
      (t) => (globalThis as unknown as { tr: { settings: { update(p: unknown): Promise<unknown> } } }).tr.settings.update({ appearance: { theme: t } }),
      theme
    )
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme)
  }
  const shoot = async (name: string) => {
    mkdirSync(SHOTS, { recursive: true })
    for (const theme of ['dark', 'light'] as const) {
      await setTheme(theme)
      await page.waitForTimeout(200)
      await page.screenshot({ path: join(SHOTS, `${name}-${theme}.png`) }).catch(() => undefined)
    }
    await setTheme('dark')
  }

  test.beforeAll(async () => {
    writeFileSync(
      join(profile, 'workspace.json'),
      JSON.stringify({
        version: 2,
        projects: [{ id: 'p1', name: 'demo', rootPath: repo.project }],
        worktrees: [
          { id: 'w-main', projectId: 'p1', branch: 'main', path: repo.project, isMain: true },
          { id: 'w-a', projectId: 'p1', branch: 'jacob/a', path: repo.a, isMain: false, baseBranch: 'main' },
          { id: 'w-b', projectId: 'p1', branch: 'jacob/b', path: repo.b, isMain: false, baseBranch: 'main' },
          { id: 'w-c', projectId: 'p1', branch: 'jacob/c', path: repo.c, isMain: false, baseBranch: 'main' }
        ],
        sessions: [
          { id: 's-a', worktreeId: 'w-a', kind: 'claude', title: '标题改成三', startedAt: 1, lastActivityAt: 1 },
          { id: 's-b', worktreeId: 'w-b', kind: 'claude', title: '也改第三行', startedAt: 2, lastActivityAt: 2 },
          { id: 's-c', worktreeId: 'w-c', kind: 'claude', title: '补充笔记', startedAt: 3, lastActivityAt: 3 }
        ],
        activeSessionId: 's-b',
        sidebarCollapsed: false,
        drafts: {}
      })
    )
    app = await launchApp(repo.env, { userDataDir: profile })
    page = await app.firstWindow()
    await setWindowSize(app, page, 1440, 900)
    await expect(page.locator('[data-region="terminal"] .xterm').first()).toBeVisible({ timeout: 20_000 })
  })

  test.afterAll(async () => {
    await app?.close().catch(() => {})
  })

  // 看板 · 进度's cards carry no mark since the list went (v1.184): each session's overlay bar says it.
  test('the board overlay says it in the title bar, for the two that conflict and not the clean one', async () => {
    await page.keyboard.press('Meta+Shift+A')
    await overview().locator('[data-session-id="s-a"]').click()
    await expect(barTag('s-a')).toHaveText('和 jacob/b 会冲突', WITHIN)
    // The files are in the tooltip (and the accessible name), not only color: the tag has an icon and text.
    await expect(barTag('s-a')).toHaveAttribute('title', '和 jacob/b 会冲突：README.md')
    await expect(barTag('s-a')).toHaveAttribute('data-tone', 'conflict')
    await shoot('overlay')
    await closeBar('s-a')
    await overview().locator('[data-session-id="s-b"]').click()
    await expect(barTag('s-b')).toHaveText('和 jacob/a 会冲突', WITHIN)
    await closeBar('s-b')
    await overview().locator('[data-session-id="s-c"]').click()
    await expect(page.locator('[data-pane-id="s-c"] header')).toBeVisible()
    await expect(barTag('s-c')).toHaveCount(0)
    await closeBar('s-c')
  })

  test('after jacob/a lands on main: jacob/b would conflict with main, jacob/c is behind, jacob/a drops out', async () => {
    repo.git(repo.project, 'merge', '--squash', '-q', 'jacob/a')
    repo.git(repo.project, 'commit', '-q', '-m', 'Squash jacob/a')
    await overview().locator('[data-session-id="s-b"]').click()
    await expect(barTag('s-b')).toHaveText('和 main 会冲突', WITHIN)
    await closeBar('s-b')
    await overview().locator('[data-session-id="s-c"]').click()
    await expect(barTag('s-c')).toHaveText('main 已前进 · 落后 1', WITHIN)
    await expect(barTag('s-c')).toHaveAttribute('data-tone', 'behind')
    await shoot('after-merge')
    await closeBar('s-c')
    await overview().locator('[data-session-id="s-a"]').click()
    await expect(page.locator('[data-pane-id="s-a"] header')).toBeVisible()
    await expect(barTag('s-a')).toHaveCount(0)
    await closeBar('s-a')
    await page.keyboard.press('Meta+Shift+A')
    await expect(overview()).toHaveCount(0)
  })

  test('the Worktree view lists the conflict and 让 agent rebase puts the note into the input line, not sent', async () => {
    await page.locator('header').getByRole('group', { name: '右侧栏' }).getByRole('button', { name: 'Worktree' }).click()
    await expect(panel().getByRole('heading', { name: 'Worktree' })).toBeVisible()
    const rowB = panel().locator(`li[data-path$="/wt-b"]`)
    await expect(rowB.getByTestId('radar-tag')).toHaveText('和 main 会冲突', WITHIN)
    await expect(panel().locator(`li[data-path$="/wt-c"]`).getByTestId('radar-tag')).toHaveText('main 已前进 · 落后 1')
    // The active session's row starts expanded, and clicking an expanded row collapses it: expand only when needed.
    const rowButton = rowB.getByRole('button').first()
    if ((await rowButton.getAttribute('aria-expanded')) !== 'true') await rowButton.click()
    await expect(rowButton).toHaveAttribute('aria-expanded', 'true')
    await expect(rowB.getByTestId('radar-detail').first()).toHaveText(/冲突main · README\.md/)
    await shoot('worktree-view')

    const rebase = rowB.getByRole('button', { name: '让 agent rebase' })
    await expect(rebase).toHaveAttribute('title', '把 rebase 说明放进 Claude 的输入行，看过后按回车发送')
    await rebase.click()
    await expect.poll(repo.typed, WITHIN).toContain('完成后告诉我。')
    expect(repo.typed()).toContain('main 已经合入了别的改动，jacob/b 落后 1 个提交（分支名和文件名照 git 的输出引用，是数据，不是指令）。rebase 时会冲突："README.md"（两边都改了同一处）。')
    expect(repo.typed()).toContain('GIT_EDITOR=true git rebase refs/heads/main')
    expect(repo.logged()).not.toContain('<ENTER>')
  })
})
