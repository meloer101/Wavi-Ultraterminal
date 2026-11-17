import { AlertCircle } from '../ui/icons'
import { AGENT_NAME } from '../lifecycle/present'
import type { SessionId } from '@shared/types'
import { defineMessages } from '@shared/i18n'
import { useMessages } from '../ui/i18n'
import { useSessionView, useWorkspace } from '../state/workspace'
import { StatusGlyph } from '../ui/StatusGlyph'
import { continueAfterSetup, dismissSetupNote, useSetupRuns } from './setup-runs'
import styles from './SetupStrip.module.css'

const M = defineMessages({
  zh: {
    skipped: (reason: string) => `没有运行 setup 脚本：${reason}`,
    gotIt: '知道了',
    failed: (code: number) => `setup 脚本失败（退出码 ${code}），输出留在终端里`,
    openTerminal: '继续打开终端',
    startAnyway: (agent: string) => `仍然启动 ${agent}`
  },
  en: {
    skipped: (reason: string) => `Setup script not run: ${reason}`,
    gotIt: 'Got it',
    failed: (code: number) => `Setup script failed (exit code ${code}); its output stays in the terminal`,
    openTerminal: 'Open the terminal anyway',
    startAnyway: (agent: string) => `Start ${agent} anyway`
  }
})

/**
 * Under the session, like the worktree-failed strip (PRD F4): the setup script failed — its output stays in the
 * terminal, and the agent starts when the user goes on — or it was not run because `.tr/settings.toml` is broken.
 */
export function SetupStrip({ sessionId }: { sessionId: SessionId }) {
  const m = useMessages(M)
  const active = useSessionView(sessionId)
  const id = active?.session.id ?? null
  const run = useSetupRuns((s) => (id ? s.runs[id] : undefined))
  if (!active || !id || !run || (run.state !== 'failed' && run.state !== 'skipped')) return null
  const kind = active.session.kind

  if (run.state === 'skipped') {
    return (
      <div className={styles.bar} role="status" data-testid="setup-strip">
        <span className={styles.icon}>
          <AlertCircle size={16} strokeWidth={1.75} />
        </span>
        <p className={styles.title}>{m.skipped(run.reason)}</p>
        <button type="button" className={styles.secondary} onClick={() => dismissSetupNote(id)}>
          {m.gotIt}
        </button>
      </div>
    )
  }
  return (
    <div className={styles.bar} role="status" data-testid="setup-strip">
      <span className={styles.icon}>
        <StatusGlyph status="error" />
      </span>
      <p className={styles.title}>{m.failed(run.code)}</p>
      <button
        type="button"
        className={styles.primary}
        onClick={() => {
          continueAfterSetup(id)
          useWorkspace.getState().requestTerminalFocus()
        }}
      >
        {kind === 'shell' ? m.openTerminal : m.startAnyway(AGENT_NAME[kind])}
      </button>
    </div>
  )
}
