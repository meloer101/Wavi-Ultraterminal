// Linked app only (src/main/source-checkout.ts): a new renderer build reloads the windows, a new main or preload
// build offers a restart. With the pty daemon both keep the terminals (the reloaded window reattaches them); with
// the fallback host they would end, so then the reload is asked first too.
import { app } from 'electron'
import { join } from 'node:path'
import { appWindows } from './app-windows'
import { confirm } from './confirm'
import { quitKeepsSessions } from './pty'
import { watchRebuilds, type BuildChange } from './rebuilds'
import { sourceRoot } from './source-checkout'
import { getMainWindow } from './windows'
import { defineMessages, pick } from '@shared/i18n'

const M = defineMessages({
  zh: {
    keeps: '终端会话会接回。',
    ends: '这次运行没有后台会话进程，正在运行的终端会结束。',
    rebuilt: (name: string) => `${name} 已重新构建，重启后生效。`,
    restartNow: '立即重启',
    later: '稍后',
    uiRebuilt: (name: string) => `${name} 的界面已重新构建。`,
    reload: '重新载入'
  },
  en: {
    keeps: 'Terminal sessions will reconnect.',
    ends: 'This run has no background session process; running terminals will end.',
    rebuilt: (name: string) => `${name} was rebuilt. Restart to use it.`,
    restartNow: 'Restart now',
    later: 'Later',
    uiRebuilt: (name: string) => `${name}'s interface was rebuilt.`,
    reload: 'Reload'
  }
})

function reloadWindows(): void {
  for (const win of appWindows()) win.webContents.reload()
}

function ask(change: BuildChange, keepsSessions: boolean): Promise<boolean> {
  const m = pick(M)
  const sessions = keepsSessions ? m.keeps : m.ends
  return confirm(
    change.restartApp
      ? { message: m.rebuilt(app.name), detail: sessions, confirmLabel: m.restartNow, cancelLabel: m.later, destructive: !keepsSessions }
      : { message: m.uiRebuilt(app.name), detail: sessions, confirmLabel: m.reload, cancelLabel: m.later, destructive: true },
    getMainWindow()
  )
}

export function registerLiveRebuilds(): void {
  const root = sourceRoot()
  if (!root) return
  let asking = false
  watchRebuilds(join(root, 'out'), (change) => {
    const keepsSessions = quitKeepsSessions()
    console.log(`[main] new build in ${root}/out:`, change.restartApp ? 'main/preload changed' : 'renderer changed')
    if (change.reloadRenderer && keepsSessions) {
      reloadWindows()
      return
    }
    if (asking) return
    asking = true
    void ask(change, keepsSessions)
      .catch(() => false)
      .then((ok) => {
        asking = false
        if (!ok) return
        if (change.restartApp) {
          app.relaunch()
          app.quit()
        } else {
          reloadWindows()
        }
      })
  })
}
