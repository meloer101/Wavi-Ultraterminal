// 设置 · 外观 · 导入主题…: pick a Ghostty / iTerm theme file, read it, and make its colors the terminal's (PRD F7).
import { dialog, ipcMain } from 'electron'
import { IPC, type ThemeImportOutcome } from '@shared/ipc'
import { hostWindowFor } from './app-windows'
import { updateSettings } from './settings'
import { readThemeFile, themeStartFolder, type ThemeFileFailure } from './theme-file'
import { defineMessages, pick } from '@shared/i18n'

const M = defineMessages<{ failure: Record<ThemeFileFailure, string>; import: string; cantImport: string; ok: string }>({
  zh: {
    failure: {
      unsupported: '这不是 Ghostty 或 iTerm 的主题文件。',
      incomplete: '文件里缺少背景色、前景色，或 16 色调色板里的某几个颜色。',
      'too-large': '文件太大，不像是主题文件。',
      unreadable: '读不了这个文件。'
    },
    import: '导入',
    cantImport: '无法导入这个主题',
    ok: '好'
  },
  en: {
    failure: {
      unsupported: "This isn't a Ghostty or iTerm theme file.",
      incomplete: 'The file is missing the background, the foreground, or some of the 16 palette colors.',
      'too-large': "The file is too large to be a theme file.",
      unreadable: "Can't read this file."
    },
    import: 'Import',
    cantImport: "Can't import this theme",
    ok: 'OK'
  }
})

export function registerThemeImportHandler(): void {
  ipcMain.handle(IPC.settingsImportTheme, async (event): Promise<ThemeImportOutcome> => {
    const win = hostWindowFor(event.sender)
    const defaultPath = themeStartFolder()
    const options = {
      properties: ['openFile', 'treatPackageAsDirectory'] as Array<'openFile' | 'treatPackageAsDirectory'>,
      buttonLabel: pick(M).import,
      ...(defaultPath ? { defaultPath } : {})
    }
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const path = picked.canceled ? undefined : picked.filePaths[0]
    if (!path) return { status: 'canceled' }

    const result = await readThemeFile(path)
    if (!result.ok) {
      const m = pick(M)
      const box = { type: 'warning' as const, message: m.cantImport, detail: m.failure[result.reason], buttons: [m.ok] }
      if (win) await dialog.showMessageBox(win, box)
      else await dialog.showMessageBox(box)
      return { status: 'failed' }
    }
    await updateSettings({
      appearance: { terminalBackground: { mode: 'custom', color: result.theme.background }, terminalColors: result.theme.colors }
    })
    return { status: 'imported', name: result.name }
  })
}
