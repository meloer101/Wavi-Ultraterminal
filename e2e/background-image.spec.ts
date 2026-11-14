// 设置 · 外观 · 背景图片 (PRD v1.189, Figma 86): the picture is stored by main, served on wavi-bg:, drawn under the base
// layer on 玻璃 (not under 实色), the settings page shows it, and 移除 deletes the stored file.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { SettingsPatch } from '../src/shared/settings'
import { launchApp, setWindowSize } from './launch'
import { decodePng } from './png'

const SHOTS = 'test-results'
const FIRST = 's-cookie'

let app: ElectronApplication
let page: Page

interface Tr {
  tr: {
    settings: { update(p: unknown): Promise<unknown>; setBackgroundImage(jpeg: Uint8Array): Promise<boolean> }
    ui: { openSettings(): void }
  }
}
interface Dom {
  document: {
    documentElement: { dataset: Record<string, string | undefined> }
    querySelector(selector: string): unknown
    createElement(tag: 'canvas'): {
      width: number
      height: number
      getContext(kind: '2d'): {
        fillStyle: unknown
        fillRect(x: number, y: number, w: number, h: number): void
        createLinearGradient(x0: number, y0: number, x1: number, y1: number): { addColorStop(o: number, c: string): void }
      }
      toBlob(cb: (b: { arrayBuffer(): Promise<ArrayBuffer> } | null) => void, type: string, q: number): void
    }
  }
  getComputedStyle(el: unknown, pseudo?: string): Record<string, string>
  Image: new () => { src: string; naturalWidth: number; onload: () => void; onerror: () => void }
}

const update = (patch: SettingsPatch) => page.evaluate((p) => (globalThis as unknown as Tr).tr.settings.update(p), patch)
const bgAttr = () => page.evaluate(() => (globalThis as unknown as Dom).document.documentElement.dataset.bgImage)

/** A warm-to-cool gradient with stripes, encoded as a JPEG in the page, as the settings page sends one. */
const sendPicture = () =>
  page.evaluate(async () => {
    const g = globalThis as unknown as Dom & Tr
    const canvas = g.document.createElement('canvas')
    canvas.width = 1600
    canvas.height = 1000
    const ctx = canvas.getContext('2d')
    const sky = ctx.createLinearGradient(0, 0, 0, 1000)
    sky.addColorStop(0, '#ff3b1f')
    sky.addColorStop(1, '#ff9a1f')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, 1600, 1000)
    ctx.fillStyle = '#7a1fff'
    for (let x = 0; x < 1600; x += 200) ctx.fillRect(x, 0, 40, 1000)
    const blob = await new Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) throw new Error('no blob')
    return g.tr.settings.setBackgroundImage(new Uint8Array(await blob.arrayBuffer()))
  })

const stored = async (): Promise<string[]> => {
  const dir = await app.evaluate(({ app: a }) => a.getPath('userData'))
  try {
    return readdirSync(join(dir, 'backgrounds'))
  } catch {
    return []
  }
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(90_000)

test.beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true })
  app = await launchApp()
  page = await app.firstWindow()
  // The e2e demo workspace (its sessions) loads with this flag set before the page's scripts.
  await page.addInitScript(() => {
    ;(globalThis as unknown as { __TR_E2E__: boolean }).__TR_E2E__ = true
  })
  await page.reload()
  await expect(page.locator(`[data-region="terminal"] [data-session-id="${FIRST}"]`)).toBeVisible({ timeout: 20_000 })
  await setWindowSize(app, page, 1440, 900)
})

test.afterAll(async () => {
  await app.close()
})

test('main refuses anything but a JPEG', async () => {
  const refused = await page.evaluate(() => (globalThis as unknown as Tr).tr.settings.setBackgroundImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2])))
  expect(refused).toBe(false)
  expect(await bgAttr()).toBe('off')
  expect(await stored()).toEqual([])
})

test('a stored picture is served on wavi-bg: and drawn under the window', async () => {
  await update({ appearance: { theme: 'dark', terminalOpacity: 0.3 } })
  expect(await sendPicture()).toBe(true)
  await expect.poll(bgAttr).toBe('on')
  const files = await stored()
  expect(files).toHaveLength(1)
  expect(files[0]).toMatch(/^[0-9a-f]{64}\.jpg$/)

  // The shell's layer names the picture, and the picture loads through the protocol and the page's CSP.
  const layer = await page.evaluate(() => {
    const g = globalThis as unknown as Dom
    return g.getComputedStyle(g.document.querySelector('[data-sidebar]'), '::before').backgroundImage
  })
  expect(layer).toContain(`wavi-bg://image/${files[0]}`)
  const width = await page.evaluate(
    (name) =>
      new Promise<number>((resolve) => {
        const img = new (globalThis as unknown as Dom).Image()
        img.onload = () => resolve(img.naturalWidth)
        img.onerror = () => resolve(-1)
        img.src = `wavi-bg://image/${name}`
      }),
    files[0]!
  )
  expect(width).toBe(1600)

  // Through a 30% terminal card the warm picture shows: red well above blue.
  await page.waitForTimeout(400)
  const box = await page.locator('[data-region="terminal"]').boundingBox()
  if (!box) throw new Error('terminal region not visible')
  const raster = decodePng(await page.screenshot({ clip: box }))
  const x = Math.floor(raster.width * 0.96)
  const y = Math.floor(raster.height * 0.5)
  const o = (y * raster.width + x) * 4
  const [r, , b] = [raster.data[o]!, raster.data[o + 1]!, raster.data[o + 2]!]
  expect(r - b).toBeGreaterThan(40)
  await page.screenshot({ path: `${SHOTS}/background-image-dark-30.png` })
})

test('模糊 blurs the layer; 实色 hides it', async () => {
  await update({ appearance: { backgroundBlur: 0.4 } })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const g = globalThis as unknown as Dom
        return g.getComputedStyle(g.document.querySelector('[data-sidebar]'), '::before').filter
      })
    )
    .toBe('blur(16px)')
  // Full screen keeps the base layer over the picture (no field, no field text), as in the window.
  const mainWindow = ({ BrowserWindow }: typeof import('electron'), on: boolean) =>
    BrowserWindow.getAllWindows().find((w) => /^(file|https?):/.test(w.webContents.getURL()))?.setFullScreen(on)
  await app.evaluate(mainWindow, true)
  await expect(page.locator('[data-sidebar][data-fullscreen="true"]')).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(1200)
  const baseDisplay = await page.evaluate(() => {
    const g = globalThis as unknown as Dom
    return g.getComputedStyle(g.document.querySelector('[data-sidebar] > [data-glass-base]')).display
  })
  expect(baseDisplay).not.toBe('none')
  await page.screenshot({ path: `${SHOTS}/background-image-fullscreen-blur.png` })
  await app.evaluate(mainWindow, false)
  await expect(page.locator('[data-sidebar][data-fullscreen="false"]')).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(1200)

  await update({ appearance: { windowMaterial: 'solid' } })
  await expect.poll(bgAttr).toBe('off')
  await update({ appearance: { windowMaterial: 'glass', backgroundBlur: 0 } })
  await expect.poll(bgAttr).toBe('on')
})

test('设置 · 外观 shows the picture in place of 全屏背景; 移除 deletes the stored file', async () => {
  await update({ appearance: { theme: 'light', terminalOpacity: 0.5, chat: { opacity: 0.5 } } })
  await page.evaluate(() => (globalThis as unknown as Tr).tr.ui.openSettings())
  const thumb = page.getByRole('img', { name: '背景图片' })
  await expect(thumb).toBeVisible()
  await expect.poll(() => thumb.evaluate((el) => (el as unknown as { naturalWidth: number }).naturalWidth)).toBe(1600)
  await expect(page.getByText('全屏背景', { exact: true })).toHaveCount(0)
  await expect(page.getByText('模糊', { exact: true })).toBeVisible()
  // The sheet fades in (motion tokens); shoot once it is there.
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${SHOTS}/background-image-settings-light.png` })

  await page.getByRole('button', { name: '移除' }).click()
  await expect.poll(bgAttr).toBe('off')
  await expect.poll(stored).toEqual([])
  await expect(page.getByRole('button', { name: '选择图片…' })).toBeVisible()
  await expect(page.getByText('全屏背景', { exact: true })).toHaveCount(1)
  await page.screenshot({ path: `${SHOTS}/background-image-settings-none.png` })

  // 选择图片… with a real PNG: the page decodes and re-encodes it, main stores one JPEG, the thumbnail shows it.
  const png = await page.screenshot()
  const { width } = decodePng(png)
  await page.getByTestId('background-file').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: png })
  await expect.poll(bgAttr).toBe('on')
  await expect.poll(stored).toHaveLength(1)
  await expect.poll(() => thumb.evaluate((el) => (el as unknown as { naturalWidth: number }).naturalWidth)).toBe(Math.min(width, 5120))
})
