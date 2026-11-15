// 文件 view (PRD F17, Figma 13D / 13G): the active worktree's tree with git state, a filter, and the read-only preview.
import { Ellipsis, FolderOpen, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import { indexStatus } from '@shared/worktree-files'
import type { SessionId } from '@shared/types'
import { defineMessages } from '@shared/i18n'
import { useMessages } from '../../ui/i18n'
import { IconButton } from '../../ui/IconButton'
import { popupMenu } from '../../ui/menu'
import { PaneHeader } from '../PaneHeader'
import { FilePreview } from './FilePreview'
import { FilesNotice } from './FilesNotice'
import { FileTree } from './FileTree'
import { collapseAll, filesOf, listenForChanges, openRoot, refreshAll, setChangedOnly, setFilter, useFiles } from './store'
import { baseName, filterPaths, pathRows, treeRows, type TreeRow } from './tree-model'
import styles from './FilesView.module.css'

const M = defineMessages({
  zh: {
    cannotReadFolder: '无法读取这个文件夹',
    notRepo: '不是 git 仓库',
    noMatchingChanges: '没有匹配的改动',
    noChanges: '没有改动',
    searching: '正在查找…',
    noMatchingFiles: '没有匹配的文件',
    emptyFolder: '文件夹是空的',
    files: '文件',
    openInFinder: '在 Finder 中打开',
    more: '更多',
    refresh: '刷新',
    collapseAll: '全部折叠',
    filter: '筛选文件名',
    showAll: '显示全部文件',
    changedOnlyTitle: '只显示有改动的文件',
    changed: (count: number) => `有改动 ${count}`
  },
  en: {
    cannotReadFolder: "Can't read this folder",
    notRepo: 'Not a git repository',
    noMatchingChanges: 'No matching changes',
    noChanges: 'No changes',
    searching: 'Searching…',
    noMatchingFiles: 'No matching files',
    emptyFolder: 'Folder is empty',
    files: 'Files',
    openInFinder: 'Open in Finder',
    more: 'More',
    refresh: 'Refresh',
    collapseAll: 'Collapse all',
    filter: 'Filter files',
    showAll: 'Show all files',
    changedOnlyTitle: 'Show only changed files',
    changed: (count: number) => `Changed ${count}`
  }
})

/** The filter lists at most this many matches. */
const MAX_MATCHES = 500

export function FilesView({ root, sessionId }: { root: string; sessionId: SessionId }) {
  const m = useMessages(M)
  const files = useFiles((s) => s.roots[root]) ?? filesOf(root)
  const treeRef = useRef<HTMLDivElement>(null)
  // Leaving the preview hands the keyboard back to the tree, once it is shown again.
  const returning = useRef(false)
  useEffect(() => {
    if (files.preview !== null || !returning.current) return
    returning.current = false
    treeRef.current?.focus()
  }, [files.preview])

  useEffect(() => {
    listenForChanges()
    openRoot(root)
    window.tr.worktree.watch(root)
    return () => window.tr.worktree.unwatch(root)
  }, [root])

  const status = useMemo(() => indexStatus(files.status), [files.status])
  const query = files.filter.trim()
  const rows = useMemo((): TreeRow[] => {
    if (files.changedOnly) {
      const changed = Object.keys(files.status?.changes ?? {})
      return pathRows(query ? filterPaths(changed, query, MAX_MATCHES) : changed, status, files.collapsed)
    }
    if (query) return pathRows(filterPaths(files.allFiles ?? [], query, MAX_MATCHES), status, files.collapsed)
    return treeRows(files, status)
  }, [files, query, status])

  if (files.preview !== null) return (
      <FilePreview
        root={root}
        path={files.preview}
        sessionId={sessionId}
        letter={status.letter(files.preview)}
        onBack={() => {
          returning.current = true
        }}
      />
    )

  const onFilterKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Escape' && files.filter) {
      e.preventDefault()
      e.stopPropagation()
      setFilter(root, '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      treeRef.current?.focus()
    }
  }

  const rootError = files.errors['']
  const empty = rootError
    ? m.cannotReadFolder
    : files.changedOnly
      ? files.status === null
        ? m.notRepo
        : query
          ? m.noMatchingChanges
          : m.noChanges
      : query
        ? files.allFiles === null
          ? m.searching
          : m.noMatchingFiles
        : files.children[''] && files.children[''].length === 0
          ? m.emptyFolder
          : null

  return (
    <>
      <PaneHeader title={m.files} context={baseName(root)}>
        <IconButton label={m.openInFinder} onClick={() => window.tr.worktree.reveal(root, '')}>
          <FolderOpen size={16} strokeWidth={1.75} />
        </IconButton>
        <IconButton
          label={m.more}
          aria-haspopup="menu"
          onClick={(e) => {
            void popupMenu(
              [
                { type: 'item', id: 'refresh', label: m.refresh },
                { type: 'item', id: 'collapse', label: m.collapseAll }
              ],
              e.currentTarget
            ).then((choice) => {
              if (choice === 'refresh') refreshAll(root)
              else if (choice === 'collapse') collapseAll(root)
            })
          }}
        >
          <Ellipsis size={16} strokeWidth={1.75} />
        </IconButton>
      </PaneHeader>
      <div className={styles.filterRow}>
        <label className={styles.search}>
          <Search size={16} strokeWidth={1.75} className={styles.searchIcon} aria-hidden />
          <input
            className={styles.input}
            type="search"
            aria-label={m.filter}
            placeholder={m.filter}
            spellCheck={false}
            value={files.filter}
            onChange={(e) => setFilter(root, e.target.value)}
            onKeyDown={onFilterKeyDown}
          />
          <button
            type="button"
            className={styles.segment}
            aria-pressed={files.changedOnly}
            disabled={files.status === null && !files.changedOnly}
            title={files.changedOnly ? m.showAll : m.changedOnlyTitle}
            onClick={() => setChangedOnly(root, !files.changedOnly)}
          >
            {m.changed(status.count)}
          </button>
        </label>
      </div>
      <FilesNotice root={root} />
      {empty && rows.length === 0 ? (
        <p className={styles.empty}>{empty}</p>
      ) : (
        <FileTree ref={treeRef} root={root} sessionId={sessionId} rows={rows} selected={files.selected} />
      )}
    </>
  )
}
