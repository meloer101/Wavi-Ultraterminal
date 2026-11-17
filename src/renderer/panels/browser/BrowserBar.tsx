// BrowserBar (Figma 130:283): back · forward · reload · borderless address field · phone viewport · open in the
// system browser.
// The address shows the host in the primary color and the path in tertiary; focused, it is a plain text field.
import { ArrowLeft, ArrowRight, ExternalLink, Globe, RotateCw, Smartphone } from '../../ui/icons'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { parseAddress, splitUrl, type BrowserPageState } from '@shared/browser'
import { defineMessages } from '@shared/i18n'
import { useMessages } from '../../ui/i18n'
import { IconButton } from '../../ui/IconButton'
import { ClosePanelButton } from '../PaneHeader'
import styles from './BrowserView.module.css'

const M = defineMessages({
  zh: {
    back: '后退',
    forward: '前进',
    reload: '刷新',
    address: '地址',
    addressPlaceholder: '输入地址或端口号，如 5173',
    exitMobile: '退出手机视口',
    mobile: '手机视口 375',
    openExternal: '用系统浏览器打开'
  },
  en: {
    back: 'Back',
    forward: 'Forward',
    reload: 'Reload',
    address: 'Address',
    addressPlaceholder: 'Enter an address or a port, e.g. 5173',
    exitMobile: 'Exit phone viewport',
    mobile: 'Phone viewport 375',
    openExternal: 'Open in system browser'
  }
})

export function BrowserBar({
  worktree,
  page,
  onError
}: {
  worktree: string
  page: BrowserPageState | undefined
  /** An address that cannot be opened: the reason, or null to clear it. */
  onError: (message: string | null) => void
}) {
  const m = useMessages(M)
  const url = page?.url ?? ''
  const mobile = page?.mobile ?? false
  const [draft, setDraft] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const editing = draft !== null
  const { host, path } = splitUrl(url)
  const browser = window.tr.browser

  // ⌘L in the page (main hands the keyboard back to the app first).
  useEffect(
    () =>
      window.tr.browser.onFocusAddress((target) => {
        if (target === worktree) input.current?.focus()
      }),
    [worktree]
  )

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      const parsed = parseAddress(e.currentTarget.value)
      if (!parsed.ok) {
        onError(parsed.error)
        return
      }
      onError(null)
      browser.navigate(worktree, parsed.url)
      input.current?.blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onError(null)
      input.current?.blur()
    }
  }

  return (
    <div className={styles.header}>
      <div className={styles.bar}>
        <IconButton label={m.back} disabled={!page?.canGoBack} onClick={() => browser.back(worktree)}>
          <ArrowLeft size={16} strokeWidth={1.75} />
        </IconButton>
        <IconButton label={m.forward} disabled={!page?.canGoForward} onClick={() => browser.forward(worktree)}>
          <ArrowRight size={16} strokeWidth={1.75} />
        </IconButton>
        <IconButton label={m.reload} disabled={!url} onClick={() => browser.reload(worktree)}>
          <RotateCw size={16} strokeWidth={1.75} />
        </IconButton>
        <label className={styles.address} data-editing={editing}>
          <Globe className={styles.globe} size={16} strokeWidth={1.75} aria-hidden />
          <input
            ref={input}
            className={styles.addressInput}
            aria-label={m.address}
            placeholder={m.addressPlaceholder}
            spellCheck={false}
            autoComplete="off"
            value={draft ?? url}
            onFocus={(e) => {
              setDraft(url)
              e.currentTarget.select()
            }}
            onBlur={() => setDraft(null)}
            onChange={(e) => {
              setDraft(e.target.value)
              onError(null)
            }}
            onKeyDown={onKeyDown}
          />
          {!editing && url && (
            <span className={styles.addressText} aria-hidden>
              <span className={styles.host}>{host}</span>
              <span className={styles.path}>{path}</span>
            </span>
          )}
        </label>
        <span className={styles.gap} />
        <IconButton
          label={mobile ? m.exitMobile : m.mobile}
          active={mobile}
          aria-pressed={mobile}
          disabled={!url}
          onClick={() => browser.setMobile(worktree, !mobile)}
        >
          <Smartphone size={16} strokeWidth={1.75} />
        </IconButton>
        <IconButton label={m.openExternal} disabled={!url} onClick={() => browser.openExternal(worktree)}>
          <ExternalLink size={16} strokeWidth={1.75} />
        </IconButton>
      </div>
      <ClosePanelButton />
    </div>
  )
}
