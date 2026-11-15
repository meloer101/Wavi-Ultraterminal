// Interface language (Figma 89): 跟随系统 follows the system's preferred languages (WAVI_LANG stands in for them),
// 设置 · 外观 · 语言 overrides it, and a change reaches the menu and the page without a restart.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp } from './launch'

interface TrWindow {
  tr: { settings: { update(patch: unknown): Promise<unknown> }; ui: { openSettings(): void } }
}

const topMenus = (app: ElectronApplication) =>
  app.evaluate(({ Menu }) => (Menu.getApplicationMenu()?.items ?? []).slice(1).map((m) => m.label))

const setLanguage = (page: Page, language: string) =>
  page.evaluate((l) => (globalThis as unknown as TrWindow).tr.settings.update({ appearance: { language: l } }), language)

test('an English system gets the English interface, and the setting switches it live', async () => {
  const app = await launchApp({ WAVI_LANG: 'en-US' })
  try {
    const page = await app.firstWindow()
    await expect(page.locator('[data-region="sidebar"]')).toBeVisible()
    expect(await topMenus(app)).toEqual(['File', 'Edit', 'Session', 'View', 'Window'])
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    await setLanguage(page, 'zh')
    await expect.poll(() => topMenus(app)).toEqual(['文件', '编辑', '会话', '显示', '窗口'])
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')

    await setLanguage(page, 'system')
    await expect.poll(() => topMenus(app)).toEqual(['File', 'Edit', 'Session', 'View', 'Window'])
  } finally {
    await app.close()
  }
})

test('设置 · 外观 · 语言 offers 跟随系统 / 中文 / English, each language in its own name', async () => {
  const app = await launchApp({ WAVI_LANG: 'en-US' })
  try {
    const page = await app.firstWindow()
    await expect(page.locator('[data-region="sidebar"]')).toBeVisible()
    await page.evaluate(() => (globalThis as unknown as TrWindow).tr.ui.openSettings())
    const row = page.locator('[data-row="language"]')
    await expect(row.getByRole('radio')).toHaveText(['System', '中文', 'English'])
    await expect(row.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true')
    await row.getByRole('radio', { name: '中文' }).click()
    await expect(row.getByRole('radio')).toHaveText(['跟随系统', '中文', 'English'])
    await expect.poll(() => topMenus(app)).toEqual(['文件', '编辑', '会话', '显示', '窗口'])
  } finally {
    await app.close()
  }
})
