// Worktree view (PRD F17, Figma 85B″): every git worktree of the active session's project, one line each — status,
// the session's title, agent and branch, then fixed columns: uncommitted, commits of its own, conflict. The selected
// row adds what the line has no room for (the conflicts and their files) and the actions. Merged worktrees without a
// session sit in 可清理 (one 全部清理 for all); other session-less ones in 没有会话 (one by one).
// Refreshes on window focus, when git's worktree / branch files change, every POLL_MS while visible, and — only the
// worktrees concerned — when their sessions change.
import { Ellipsis, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { SHORTCUTS } from '@shared/shortcuts'
import type { ProjectId, Session, WorktreeId } from '@shared/types'
import { defineMessages } from '@shared/i18n'
import { useLang, useMessages } from '../../i18n'
import { newSessionInProject } from '../../state/session-actions'
import { useWorkspace } from '../../state/workspace'
import { IconButton } from '../../ui/IconButton'
import { formatAccelerator } from '../../ui/menu-model'
import { StatusGlyph } from '../../ui/StatusGlyph'
import { openMergeSheet } from '../merge/store'
import { agentLabel, agentSessionFor } from '../merge/model'
import { wantsRebase } from '@shared/conflict-radar'
import { rebaseWithAgent } from '../../conflict-radar/actions'
import { radarDetailLines } from '../../conflict-radar/model'
import { RadarTag } from '../../conflict-radar/RadarTag'
import { useWorktreeRadarMark } from '../../conflict-radar/store'
import { AgentIcon } from '../../ui/AgentIcon'
import { PaneHeader } from '../PaneHeader'
import { cleanUpInteractive, openRowMenu, selectRow } from './actions'
import { buildRows, selectedRow, tildePath, type WorktreeGroups, type WorktreeRow } from './model'
import { patchRoot, refreshWorktrees, useWorktrees, watchRepo, worktreesOf } from './store'
import styles from './WorktreeView.module.css'

const M = defineMessages({
  zh: {
    reading: '正在读取 worktree…',
    readFailed: '无法读取 worktree',
    notRepo: '不是 git 仓库',
    newSession: '新建会话',
    cleanable: '可清理',
    cleanAll: '全部清理',
    noSession: '没有会话',
    uncommitted: (diff: string) => `未提交 ${diff}`,
    behind: (base: string, behind: number) => `落后 ${base} ${behind} 个提交`,
    mergeInto: (base: string) => `合并到 ${base}…`,
    openFolder: '打开文件夹',
    rebaseTitle: (agent: string) => `把 rebase 说明放进 ${agent} 的输入行，看过后按回车发送`,
    handOffFailed: (agent: string, error: string) => `没能交给 ${agent}：${error}`,
    rebase: '让 agent rebase',
    more: '更多'
  },
  en: {
    reading: 'Reading worktrees…',
    readFailed: "Can't read worktrees",
    notRepo: 'Not a git repository',
    newSession: 'New session',
    cleanable: 'Can clean up',
    cleanAll: 'Clean up all',
    noSession: 'No session',
    uncommitted: (diff: string) => `Uncommitted ${diff}`,
    behind: (base: string, behind: number) => `${behind} ${behind === 1 ? 'commit' : 'commits'} behind ${base}`,
    mergeInto: (base: string) => `Merge into ${base}…`,
    openFolder: 'Open folder',
    rebaseTitle: (agent: string) => `Put the rebase instructions into ${agent}'s input line; press Return to send once you've checked them`,
    handOffFailed: (agent: string, error: string) => `Couldn't hand off to ${agent}: ${error}`,
    rebase: 'Let agent rebase',
    more: 'More'
  }
})

/** Session changes (new, closed, status) come in bursts; list once they settle. */
const SESSION_REFRESH_DELAY_MS = 400
/** Catches what no event reports (edits inside a worktree), only while the window is visible. */
const POLL_MS = 20_000

interface Props {
  projectId: ProjectId
  /** The project's main checkout. */
  root: string
  projectName: string
  activeWorktreeId: WorktreeId | null
}

/** Per workspace worktree: its sessions and their states, to tell which worktrees a session change touched. */
function sessionKeys(sessions: readonly Session[]): Map<WorktreeId, string> {
  const keys = new Map<WorktreeId, string>()
  for (const s of sessions) keys.set(s.worktreeId, `${keys.get(s.worktreeId) ?? ''}${s.id}:${s.status};`)
  return keys
}

export function WorktreeView({ projectId, root, projectName, activeWorktreeId }: Props) {
  const m = useMessages(M)
  // The rows' words are picked when they are built: build them again in the other language.
  const lang = useLang()
  const state = useWorktrees((s) => s.roots[root]) ?? worktreesOf(root)
  const worktrees = useWorkspace(useShallow((s) => s.worktrees.filter((w) => w.projectId === projectId)))
  const sessions = useWorkspace(
    useShallow((s) => {
      const ids = new Set(worktrees.map((w) => w.id))
      return s.sessions.filter((x) => ids.has(x.worktreeId))
    })
  )
  const knownPaths = useMemo(() => worktrees.map((w) => w.path), [worktrees])
  const refresh = useCallback((only?: string[]) => refreshWorktrees(root, knownPaths, only), [root, knownPaths])
  const refreshAll = useCallback(() => refresh(), [refresh])

  const groups = useMemo(() => (state.listing ? buildRows(state.listing, worktrees, sessions) : null), [state.listing, worktrees, sessions, lang]) // eslint-disable-line react-hooks/exhaustive-deps
  // The session-change timer below maps worktree ids to rows when it fires, not when it was set.
  const groupsRef = useRef<WorktreeGroups | null>(groups)
  useEffect(() => {
    groupsRef.current = groups
  }, [groups])

  // Sessions opening, closing or changing state (an agent finishing a turn commits): list those worktrees again.
  const previousKeys = useRef<Map<WorktreeId, string> | null>(null)
  const keys = useMemo(() => sessionKeys(sessions), [sessions])
  useEffect(() => {
    const before = previousKeys.current
    previousKeys.current = keys
    if (!before || worktreesOf(root).listing === undefined) {
      void refresh()
      return
    }
    const changed = [...new Set([...before.keys(), ...keys.keys()])].filter((id) => before.get(id) !== keys.get(id))
    if (changed.length === 0) return
    const timer = setTimeout(() => {
      const rows = groupsRef.current ? [...groupsRef.current.working, ...groupsRef.current.cleanable, ...groupsRef.current.idle] : []
      const paths = changed.map((id) => rows.find((r) => r.worktreeIds.includes(id))?.key)
      // A worktree the listing does not know yet (a session in a new folder): list everything.
      void (paths.every((p) => p !== undefined) ? refresh(paths as string[]) : refresh())
    }, SESSION_REFRESH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [root, refresh, keys])

  useEffect(() => {
    window.addEventListener('focus', refreshAll)
    const offChanged = window.tr.gitWorktrees.onChanged((changedRoot) => {
      if (changedRoot === root) void refreshAll()
    })
    const unwatch = watchRepo(root)
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void refreshAll()
    }, POLL_MS)
    return () => {
      window.removeEventListener('focus', refreshAll)
      offChanged()
      unwatch()
      clearInterval(poll)
    }
  }, [root, refreshAll])

  // Switching sessions anywhere else moves the selection to the new session's worktree.
  useEffect(() => patchRoot(root, { picked: null }), [root, activeWorktreeId])

  const selected = groups ? selectedRow([...groups.working, ...groups.cleanable, ...groups.idle], state.picked, activeWorktreeId) : null
  const rowProps = { projectId, root, refresh: refreshAll }

  const empty =
    state.listing === undefined ? m.reading : state.listing === null ? (state.failed ? m.readFailed : m.notRepo) : null

  return (
    <>
      <PaneHeader title="Worktree" context={projectName}>
        <IconButton
          label={m.newSession}
          title={`${m.newSession} · ⌘N`}
          aria-haspopup="dialog"
          onClick={() => newSessionInProject(projectId)}
        >
          <Plus size={16} strokeWidth={1.75} />
        </IconButton>
      </PaneHeader>
      {state.notice && (
        <p className={styles.notice} role="status">
          {state.notice}
        </p>
      )}
      {empty || !groups ? (
        <p className={styles.empty}>{empty}</p>
      ) : (
        <div className={styles.body}>
          <ul className={styles.list} aria-label="Worktree">
            {groups.working.map((row) => (
              <Row key={row.key} row={row} selected={row === selected} {...rowProps} />
            ))}
          </ul>
          {groups.cleanable.length > 0 && (
            <section aria-label={m.cleanable}>
              <div className={styles.groupHeader}>
                <h3 className={styles.groupTitle}>{m.cleanable}</h3>
                <span className={styles.groupCount}>{groups.cleanable.length}</span>
                <button
                  type="button"
                  className={styles.ghost}
                  disabled={state.busy}
                  onClick={() => void cleanUpInteractive(root, groups.cleanable, refreshAll)}
                >
                  {m.cleanAll}
                </button>
              </div>
              <ul className={styles.list} aria-label={m.cleanable}>
                {groups.cleanable.map((row) => (
                  <Row key={row.key} row={row} selected={row === selected} cleanable {...rowProps} />
                ))}
              </ul>
            </section>
          )}
          {groups.idle.length > 0 && (
            <section aria-label={m.noSession}>
              <div className={styles.groupHeader}>
                <h3 className={styles.groupTitle}>{m.noSession}</h3>
                <span className={styles.groupCount}>{groups.idle.length}</span>
              </div>
              <ul className={styles.list} aria-label={m.noSession}>
                {groups.idle.map((row) => (
                  <Row key={row.key} row={row} selected={row === selected} {...rowProps} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  )
}

interface RowProps {
  row: WorktreeRow
  selected: boolean
  /** In 可清理: the title is quieter. */
  cleanable?: boolean
  projectId: ProjectId
  root: string
  refresh: () => Promise<void>
}

/** One worktree (Figma 85B″): a single line; the selected one expands into its conflicts and the actions. */
function Row({ row, selected, cleanable = false, projectId, root, refresh }: RowProps) {
  const m = useMessages(M)
  const { info } = row
  const radar = useWorktreeRadarMark(root, row.worktreeIds)
  const activeSessionId = useWorkspace((s) => s.activeSessionId)
  const rebaseTarget = radar && wantsRebase(radar.self) ? agentSessionFor(row.sessions, activeSessionId) : null
  const radarLines = selected && radar ? radarDetailLines(radar) : []
  return (
    <li className={styles.item} data-selected={selected} data-cleanable={cleanable || undefined} data-path={info.path}>
      <button
        type="button"
        className={styles.row}
        aria-expanded={selected}
        title={tildePath(row.openPath, window.tr.homeDir)}
        onClick={() => selectRow(root, row, selected)}
      >
        <span className={styles.glyph}>
          {row.status ? (
            <StatusGlyph status={row.status} />
          ) : (
            <span aria-hidden className={styles.noSession}>
              <StatusGlyph status="exited" />
            </span>
          )}
        </span>
        <span className={styles.title}>{row.title}</span>
        <span className={styles.where}>
          {row.agent && <AgentIcon kind={row.agent} size={12} />}
          {row.where && <span className={styles.whereText}>{row.where}</span>}
        </span>
        <span className={styles.diff} title={row.diff ? m.uncommitted(row.diff) : undefined}>
          {row.diff}
        </span>
        <span className={styles.ahead} title={info.base && info.behind ? m.behind(info.base, info.behind) : undefined}>
          {row.ahead}
        </span>
        <span className={styles.radar}>{radar && <RadarTag mark={radar} short />}</span>
      </button>
      {selected && (
        <div className={styles.details}>
          {radarLines.map((line, i) => (
            <p key={i} className={styles.radarLine} title={line.title} data-testid="radar-detail">
              <span className={styles.radarText}>{line.text}</span>
              {line.files && <span className={styles.radarFiles}>{line.files}</span>}
            </p>
          ))}
          <div className={styles.actions}>
            {/* No base on the base itself; a feature branch out in the main checkout merges like any other; once merged, nothing to merge. */}
            {info.base && !info.merged && (
              <button
                type="button"
                className={styles.action}
                disabled={info.prunable !== null}
                onClick={() =>
                  openMergeSheet({ projectId, root, worktreePath: info.path, worktreeIds: row.worktreeIds, isMain: info.isMain })
                }
              >
                {m.mergeInto(info.base)}<span className={styles.shortcut}>{formatAccelerator(SHORTCUTS['merge-worktree'])}</span>
              </button>
            )}
            <button
              type="button"
              className={styles.action}
              disabled={info.prunable !== null}
              onClick={() => window.tr.worktree.reveal(row.openPath, '')}
            >
              {m.openFolder}
            </button>
            {radar && rebaseTarget && (
              <button
                type="button"
                className={styles.action}
                title={m.rebaseTitle(agentLabel(rebaseTarget.kind))}
                onClick={() =>
                  void rebaseWithAgent(radar.self, rebaseTarget).then((error) => {
                    if (error) patchRoot(root, { notice: m.handOffFailed(agentLabel(rebaseTarget.kind), error) })
                  })
                }
              >
                {m.rebase}
              </button>
            )}
            <span className={styles.spacer} />
            <IconButton
              label={m.more}
              aria-haspopup="menu"
              onClick={(e) => void openRowMenu(projectId, root, row, e.currentTarget, refresh)}
            >
              <Ellipsis size={16} strokeWidth={1.75} />
            </IconButton>
          </div>
        </div>
      )}
    </li>
  )
}
