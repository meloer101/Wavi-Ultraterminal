// The interface language in main (Figma 89): 设置 · 外观 · 语言, with 跟随系统 resolved against the system's preferred
// languages. Main's own strings (menu, dialogs, notifications) use it, and every window gets it: synchronously when
// it loads (preload) and on each change. WAVI_LANG stands in for the system's languages (e2e runs pin it).
import { app, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { getLang, resolveLang, setLang, type Lang } from '@shared/i18n'
import type { AppSettings } from '@shared/settings'
import { appWindows } from './app-windows'
import { getSettings, onSettingsChange } from './settings'

function systemLanguages(): string[] {
  const pinned = process.env.WAVI_LANG
  return pinned ? [pinned] : app.getPreferredSystemLanguages()
}

function resolve(settings: AppSettings): Lang {
  return resolveLang(settings.appearance.language, systemLanguages())
}

/**
 * Sets main's language from the stored setting and keeps it current. `onChange` runs after each change (the app
 * menu is rebuilt there). Call before anything builds text: the menu, the first window.
 */
export function registerLanguage(onChange: () => void): void {
  setLang(resolve(getSettings()))
  ipcMain.on(IPC.appLanguage, (event) => {
    event.returnValue = getLang()
  })
  onSettingsChange((settings) => {
    const next = resolve(settings)
    if (next === getLang()) return
    setLang(next)
    for (const win of appWindows()) {
      if (!win.webContents.isDestroyed()) win.webContents.send(IPC.appLanguageChanged, next)
    }
    onChange()
  })
}
