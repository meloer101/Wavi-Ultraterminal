// 设置 · 外观 · 背景图片 (PRD v1.189, Figma 86): main keeps the user's picture in <userData>/backgrounds/ under its content
// hash and serves it to every window on the wavi-bg: scheme. The page encodes the picked file itself (a JPEG, long edge
// capped), so main never decodes an image; it checks the bytes, writes them and keeps only the picture in use.
import { createHash } from 'node:crypto'
import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, ipcMain, net, protocol } from 'electron'
import { BACKGROUND_MAX_BYTES, BACKGROUND_SCHEME, backgroundNameFromUrl, isBackgroundImageName, looksLikeJpeg } from '@shared/background-image'
import { IPC } from '@shared/ipc'
import { getSettings, onSettingsChange, updateSettings } from './settings'

const folder = (): string => join(app.getPath('userData'), 'backgrounds')

/**
 * Before app ready: a standard scheme parses `wavi-bg://image/<name>` like a URL (host + path); secure keeps it out of
 * mixed-content warnings. Electron takes one registerSchemesAsPrivileged call per run; nothing else in Wavi makes one.
 */
export function registerBackgroundScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: BACKGROUND_SCHEME, privileges: { standard: true, secure: true } }])
}

/**
 * Stores and prunes run one at a time: a prune between another store's write and its settings update would delete the
 * picture the settings are about to name (two pictures picked in quick succession).
 */
let queue: Promise<unknown> = Promise.resolve()
function serially<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

/** Removes every stored picture but the one the settings name now (none when ''). Files that are not ours are left alone. */
async function prune(): Promise<void> {
  const keep = getSettings().appearance.backgroundImage
  let names: string[]
  try {
    names = await readdir(folder())
  } catch {
    return
  }
  await Promise.all(
    names
      .filter((name) => isBackgroundImageName(name) && name !== keep)
      .map((name) => rm(join(folder(), name), { force: true }).catch((error: unknown) => console.warn('[background] could not remove', name, error)))
  )
}

async function store(payload: unknown): Promise<boolean> {
  if (!(payload instanceof Uint8Array) || payload.length > BACKGROUND_MAX_BYTES || !looksLikeJpeg(payload)) {
    console.warn('[background] refused a picture that is not a JPEG within', BACKGROUND_MAX_BYTES, 'bytes')
    return false
  }
  const name = `${createHash('sha256').update(payload).digest('hex')}.jpg`
  try {
    await mkdir(folder(), { recursive: true })
    await writeFile(join(folder(), name), payload)
  } catch (error) {
    console.warn('[background] could not store the picture:', error)
    return false
  }
  await updateSettings({ appearance: { backgroundImage: name } })
  return true
}

export function registerBackgroundImage(): void {
  protocol.handle(BACKGROUND_SCHEME, (request) => {
    const name = backgroundNameFromUrl(request.url)
    if (!name) return new Response(null, { status: 404 })
    return net.fetch(pathToFileURL(join(folder(), name)).toString())
  })
  ipcMain.handle(IPC.settingsSetBackgroundImage, (_event, payload: unknown) => serially(() => store(payload)))
  // A name whose file is gone (a settings write that failed after its picture was replaced, a hand-cleared folder) would
  // draw nothing: forget it.
  void serially(async () => {
    const named = getSettings().appearance.backgroundImage
    if (!named) return
    try {
      await access(join(folder(), named))
    } catch {
      console.warn('[background] the stored picture is missing; clearing the background picture')
      await updateSettings({ appearance: { backgroundImage: '' } })
    }
  })
  // 更换… and 移除 leave the old file behind; drop it once the settings no longer name it.
  let shown = getSettings().appearance.backgroundImage
  void serially(prune)
  onSettingsChange((settings) => {
    const next = settings.appearance.backgroundImage
    if (next === shown) return
    shown = next
    void serially(prune)
  })
}
