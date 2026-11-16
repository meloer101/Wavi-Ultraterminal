// A file reference in a GUI session (PRD F23, Figma 90A / 90A′ / 90E), as the terminal's path links (PRD v1.17): it
// is a link only once main says it is an existing file of the session's worktree. Click: the 文件 view's preview at
// that line; ⌘-click: the default editor; right-click: the link menu. Resting on it shows the lines around it, colored.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { ExternalLink, FileText } from 'lucide-react'
import { defineMessages } from '@shared/i18n'
import type { SessionId } from '@shared/types'
import { openFile, openFileLinkMenu, worktreeOf, type FileLink } from '../state/link-actions'
import { useMessages } from '../ui/i18n'
import { CopyButton } from './CopyButton'
import type { FileRefTarget } from './file-refs'
import { highlightLines, languageOfPath } from './highlight'
import { Tokens } from './Highlighted'
import { HoverCard, useHoverCard } from './HoverCard'
import styles from './Chat.module.css'

const M = defineMessages({
  zh: { openInEditor: '用默认编辑器打开', copyPath: '复制路径' },
  en: { openInEditor: 'Open in default editor', copyPath: 'Copy path' }
})

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

/** The session whose worktree the references below are read against (ChatMarkdown, Feed). */
export const RefSession = createContext<SessionId | null>(null)

// --- which paths are files: one batched resolveLinks round trip per worktree and tick ------------------------------

/** resolveLinks takes at most this many paths a call. */
const BATCH = 64
/** A path that was not a file may be one soon (the agent writes it next): asked again after this long. */
const MISS_TTL_MS = 5_000

const resolved = new Map<string, Promise<string | null>>()
const pending = new Map<string, { path: string; settle(value: string | null): void }[]>()
let flushing = false

function flush(): void {
  flushing = false
  for (const [root, asks] of pending) {
    pending.delete(root)
    for (let i = 0; i < asks.length; i += BATCH) {
      const chunk = asks.slice(i, i + BATCH)
      window.tr.worktree.resolveLinks(root, chunk.map((a) => a.path)).then(
        (results) => chunk.forEach((a, j) => a.settle(results[j] ?? null)),
        () => chunk.forEach((a) => a.settle(null))
      )
    }
  }
}

/** The path relative to `root` when it is an existing file there, else null (asked once, cached). */
function resolvePath(root: string, path: string): Promise<string | null> {
  const key = `${root}\0${path}`
  let found = resolved.get(key)
  if (!found) {
    found = new Promise<string | null>((settle) => {
      const asks = pending.get(root) ?? []
      asks.push({ path, settle })
      pending.set(root, asks)
      if (!flushing) {
        flushing = true
        queueMicrotask(flush)
      }
    })
    resolved.set(key, found)
    void found.then((value) => {
      if (value === null) setTimeout(() => resolved.delete(key), MISS_TTL_MS)
    })
  }
  return found
}

function useResolved(sessionId: SessionId | null, path: string): FileLink | null {
  const root = sessionId ? worktreeOf(sessionId) : undefined
  const [file, setFile] = useState<string | null>(null)
  useEffect(() => {
    if (!root) return
    let live = true
    void resolvePath(root, path).then((value) => {
      if (live) setFile(value)
    })
    return () => {
      live = false
    }
  }, [root, path])
  return sessionId && root && file ? { root, path: file, line: null, sessionId } : null
}

// --- the link ------------------------------------------------------------------------------------------------------

/** `children` as a link to the file when it is one of the session's; as they are otherwise. */
export function FileRef({ target, children }: { target: FileRefTarget; children: ReactNode }) {
  const sessionId = useContext(RefSession)
  const found = useResolved(sessionId, target.path)
  const anchor = useRef<HTMLAnchorElement>(null)
  const { open, hover, close } = useHoverCard()
  if (!found) return <>{children}</>
  const file: FileLink = { ...found, line: target.line }
  const onClick = (event: MouseEvent): void => {
    event.preventDefault()
    close()
    openFile(file, event.metaKey ? 'external' : 'internal')
  }
  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
    close()
    void openFileLinkMenu(file, { x: event.clientX, y: event.clientY })
  }
  return (
    <>
      <a ref={anchor} href="#" className={styles.fileRef} data-testid="gui-file-ref" onClick={onClick} onContextMenu={onContextMenu} {...hover}>
        {children}
      </a>
      {open && (
        <HoverCard anchor={anchor} hover={hover} onClose={close} testId="gui-file-card">
          <FileCard file={file} column={target.column} />
        </HoverCard>
      )}
    </>
  )
}

/** Lines shown around the referenced one (Figma 90A: three before, three after); the first seven without a line. */
const AROUND = 3

/** Figma 90A: path:line · open in the default editor · copy the path; the lines around it, that one marked. */
function FileCard({ file, column }: { file: FileLink; column: number | null }) {
  const m = useMessages(M)
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    window.tr.worktree.readFile(file.root, file.path).then(
      (preview) => {
        if (live) setText(preview.kind === 'text' ? preview.text : '')
      },
      () => {
        if (live) setText('')
      }
    )
    return () => {
      live = false
    }
  }, [file.root, file.path])
  const view = useMemo(() => {
    if (text === null) return null
    const all = text.split('\n')
    const at = file.line !== null ? Math.min(Math.max(file.line, 1), all.length) : 1
    const from = Math.max(1, file.line !== null ? at - AROUND : 1)
    const lines = all.slice(from - 1, from - 1 + 2 * AROUND + 1)
    const language = languageOfPath(file.path)
    return { from, lines, colored: language ? highlightLines(lines.join('\n'), language) : null }
  }, [text, file.line, file.path])
  const label = `${file.path}${file.line !== null ? `:${file.line}` : ''}${file.line !== null && column !== null ? `:${column}` : ''}`
  return (
    <>
      <div className={styles.cardHeader}>
        <FileText {...ICON} />
        <span className={styles.cardPath} title={label}>
          {file.path}
          {file.line !== null && <span className={styles.cardLine}>:{file.line}</span>}
        </span>
        <button type="button" className={styles.actionIcon} aria-label={m.openInEditor} title={m.openInEditor} onClick={() => openFile(file, 'external')}>
          <ExternalLink {...ICON} />
        </button>
        <CopyButton text={file.path} label={m.copyPath} />
      </div>
      {view && view.lines.length > 0 && (
        <pre className={styles.cardCode}>
          {view.lines.map((line, i) => (
            <span key={i} className={styles.cardCodeLine} data-current={file.line === view.from + i || undefined}>
              <span className={styles.cardLineNumber}>{view.from + i}</span>
              {view.colored?.[i] ? <Tokens tokens={view.colored[i]} /> : line}
              {'\n'}
            </span>
          ))}
        </pre>
      )}
    </>
  )
}
