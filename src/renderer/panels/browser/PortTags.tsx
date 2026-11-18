// `:5173` tags for a session (PRD F14), on the sidebar row and the overview.
// Click opens the built-in browser, ⌥-click the system browser, right-click asks main to end the process.
import { portUrl } from '@shared/browser'
import { defineMessages } from '@shared/i18n'
import { useMessages } from '../../ui/i18n'
import { openLink } from '../../state/link-actions'
import { useBrowser } from './store'
import styles from './PortTags.module.css'

const M = defineMessages({
  zh: {
    title: (url: string) => `在内置浏览器打开 ${url} · ⌥ 点击用系统浏览器打开 · 右键结束进程`,
    open: (url: string) => `打开 ${url}`
  },
  en: {
    title: (url: string) => `Open ${url} in the built-in browser · ⌥-click to open in the system browser · Right-click to end the process`,
    open: (url: string) => `Open ${url}`
  }
})

/** Renders nothing when this session is not listening. */
export function PortTags({ sessionId, max = 2 }: { sessionId: string; max?: number }) {
  const m = useMessages(M)
  const ports = useBrowser((s) => s.ports[sessionId])
  if (!ports || ports.length === 0) return null
  const shown = ports.slice(0, max)
  const hidden = ports.slice(max)
  const rest = hidden.length
  return (
    <span className={styles.ports} data-testid="port-tags">
      {shown.map((p) => {
        const url = portUrl(p)
        return (
          <button
            key={`${p.host}:${p.port}:${p.pid}`}
            type="button"
            className={styles.port}
            title={`${p.label ? `${p.label} · ` : ''}${m.title(url)}`}
            aria-label={m.open(url)}
            onClick={(e) => {
              e.stopPropagation()
              // ctrl-click is the context-menu gesture on macOS; that path ends the process.
              if (e.button !== 0 || e.ctrlKey) return
              openLink(sessionId, url, e.altKey ? 'external' : 'internal')
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void window.tr.browser.endListener(sessionId, p.pid)
            }}
          >
            :{p.port}
          </button>
        )
      })}
      {rest > 0 && (
        <span className={styles.more} title={hidden.map((p) => `:${p.port}`).join(' ')}>
          +{rest}
        </span>
      )}
    </span>
  )
}
