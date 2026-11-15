// Read-only file preview (PRD F17, Figma 13F): line numbers and change marks, long lines wrap; Markdown renders,
// with its source one click away. Esc / ← goes back to the tree.
import { ArrowLeft, BookOpen, Code, Ellipsis, FileCode } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { SessionId } from '@shared/types'
import { defineMessages } from '@shared/i18n'
import { useMessages } from '../../ui/i18n'
import type { FilePreview as Preview, GitLetter, LineMark, LineMarkRange } from '@shared/worktree-files'
import { IconButton } from '../../ui/IconButton'
import { formatAccelerator } from '../../ui/menu-model'
import { ClosePanelButton } from '../PaneHeader'
import { openFileMenu, runFileAction, type FileTarget } from './actions'
import { FilesNotice } from './FilesNotice'
import { FILE_SHORTCUTS, fileActionForKey } from './keys'
import { isMarkdownPath } from './markdown-model'
import { MarkdownView } from './MarkdownView'
import { reveal, showPreview, useFiles } from './store'
import { parentOf } from './tree-model'
import { previewLines, MAX_PREVIEW_LINES } from './preview-model'
import styles from './FilesView.module.css'

const M = defineMessages({
  zh: {
    cannotRead: '无法读取这个文件',
    binary: '二进制文件，无法预览',
    tooLarge: (shortcut: string) => `文件超过 1 MB，用默认编辑器打开（${shortcut}）`,
    deleted: '文件已删除',
    backToTree: '返回目录树',
    showRendered: '显示渲染结果',
    showSource: '显示源码',
    openInEditor: '用默认编辑器打开',
    more: '更多',
    preview: (path: string) => `${path} 预览`,
    truncated: (lines: number, shortcut: string) => `只显示前 ${lines} 行，用默认编辑器打开查看全部（${shortcut}）`,
    mark: { add: '新增的行', mod: '改动的行' } as Record<LineMark, string>
  },
  en: {
    cannotRead: "Can't read this file",
    binary: "Binary file, can't preview",
    tooLarge: (shortcut: string) => `File is over 1 MB. Open it in the default editor (${shortcut})`,
    deleted: 'File deleted',
    backToTree: 'Back to file tree',
    showRendered: 'Show rendered',
    showSource: 'Show source',
    openInEditor: 'Open in default editor',
    more: 'More',
    preview: (path: string) => `${path} preview`,
    truncated: (lines: number, shortcut: string) => `Showing the first ${lines} lines. Open in the default editor to see all (${shortcut})`,
    mark: { add: 'Added line', mod: 'Changed line' }
  }
})

interface Loaded {
  /** The file this was read from; another one's content is never shown under this path. */
  path: string
  preview: Preview
  marks: LineMarkRange[]
}

interface Props {
  root: string
  path: string
  sessionId: SessionId
  letter: GitLetter | null
  /** Back to the tree (which then takes the keyboard). */
  onBack(): void
}

export function FilePreview({ root, path, sessionId, letter, onBack }: Props) {
  const m = useMessages(M)
  const revision = useFiles((s) => s.roots[root]?.previewRevision ?? 0)
  const targetLine = useFiles((s) => s.roots[root]?.previewLine ?? null)
  const request = useFiles((s) => s.roots[root]?.previewRequest ?? 0)
  const [read, setLoaded] = useState<Loaded | null>(null)
  const loaded = read?.path === path ? read : null
  const [error, setError] = useState<string | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const target: FileTarget = { root, path, dir: false, sessionId }

  useEffect(() => {
    let cancelled = false
    const wantsMarks = letter === 'M' || letter === 'A'
    void Promise.all([window.tr.worktree.readFile(root, path), wantsMarks ? window.tr.worktree.lineMarks(root, path) : Promise.resolve([])])
      .then(([preview, marks]) => {
        if (cancelled) return
        setLoaded({ path, preview, marks })
        setError(null)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [root, path, letter, revision])

  useEffect(() => body.current?.focus({ preventScroll: true }), [path])

  // Markdown opens rendered, except from a `path:line` link (the line is in the source). Per file and request.
  const markdown = isMarkdownPath(path)
  const viewKey = `${path}\n${request}`
  const [view, setView] = useState({ key: viewKey, source: targetLine !== null })
  const source = !markdown || (view.key === viewKey ? view.source : targetLine !== null)
  const rendered = !source && loaded?.preview.kind === 'text' ? loaded.preview.text : null

  const lines = useMemo(
    () => (loaded?.preview.kind === 'text' ? previewLines(loaded.preview.text, letter === 'U' ? 'all-added' : loaded.marks) : null),
    [loaded, letter]
  )

  // A `path:line` link: centre that line once the text is in, once per request (not again when the file reloads).
  const scrolledFor = useRef<number | null>(null)
  useEffect(() => {
    if (!lines || targetLine === null || scrolledFor.current === request) return
    scrolledFor.current = request
    body.current?.querySelector(`[data-line="${targetLine}"]`)?.scrollIntoView({ block: 'center' })
  }, [lines, targetLine, request])

  const back = () => {
    reveal(root, path)
    showPreview(root, null)
    onBack()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' || (e.key === 'ArrowLeft' && !e.metaKey && !e.altKey && (body.current?.scrollLeft ?? 0) === 0)) {
      e.preventDefault()
      e.stopPropagation()
      back()
      return
    }
    const action = fileActionForKey(e)
    if (!action || action === 'preview') return
    e.preventDefault()
    e.stopPropagation()
    runFileAction(action, target)
  }

  const dir = parentOf(path)
  const name = path.slice(dir ? dir.length + 1 : 0)
  const message = error
    ? m.cannotRead
    : loaded?.preview.kind === 'binary'
      ? m.binary
      : loaded?.preview.kind === 'too-large'
        ? m.tooLarge(formatAccelerator(FILE_SHORTCUTS.open))
        : loaded?.preview.kind === 'missing'
          ? m.deleted
          : null

  return (
    <>
      <div className={styles.previewHeader}>
        <IconButton label={m.backToTree} title={`${m.backToTree} · Esc`} onClick={back}>
          <ArrowLeft size={16} strokeWidth={1.75} />
        </IconButton>
        <span className={styles.path} title={path}>
          {dir && (
            <span className={styles.pathDir}>
              <bdi dir="ltr">{dir}/</bdi>
            </span>
          )}
          <span className={styles.pathName}>{name}</span>
        </span>
        {letter && (
          <span className={styles.mark} data-mark={letter}>
            {letter}
          </span>
        )}
        <span className={styles.previewTools}>
          {markdown && (
            <IconButton
              label={source ? m.showRendered : m.showSource}
              aria-pressed={source}
              active={source}
              onClick={() => setView({ key: viewKey, source: !source })}
            >
              {source ? <BookOpen size={16} strokeWidth={1.75} /> : <FileCode size={16} strokeWidth={1.75} />}
            </IconButton>
          )}
          <IconButton label={m.openInEditor} title={`${m.openInEditor} · ${formatAccelerator(FILE_SHORTCUTS.open)}`} onClick={() => runFileAction('open', target)}>
            <Code size={16} strokeWidth={1.75} />
          </IconButton>
          <IconButton label={m.more} aria-haspopup="menu" onClick={(e) => void openFileMenu(target, e.currentTarget, { withPreview: false })}>
            <Ellipsis size={16} strokeWidth={1.75} />
          </IconButton>
          <ClosePanelButton />
        </span>
      </div>
      <FilesNotice root={root} />
      <div ref={body} className={styles.code} tabIndex={0} role="document" aria-label={m.preview(path)} data-testid="file-preview" onKeyDown={onKeyDown}>
        {message ? (
          <p className={styles.empty}>{message}</p>
        ) : rendered !== null ? (
          <MarkdownView root={root} path={path} sessionId={sessionId} text={rendered} />
        ) : (
          lines && (
            <div className={styles.lines}>
              {lines.rows.map((line) => (
                <div
                  key={line.number}
                  className={styles.line}
                  data-line={line.number}
                  data-mark={line.mark ?? undefined}
                  data-target={line.number === targetLine || undefined}
                >
                  <span className={styles.changeMark} aria-label={line.mark ? m.mark[line.mark] : undefined} />
                  <span className={styles.lineNo}>{line.number}</span>
                  <span className={styles.lineText}>{line.text}</span>
                </div>
              ))}
              {lines.truncated && (
                <p className={styles.truncated}>
                  {m.truncated(MAX_PREVIEW_LINES, formatAccelerator(FILE_SHORTCUTS.open))}
                </p>
              )}
            </div>
          )
        )}
      </div>
    </>
  )
}
