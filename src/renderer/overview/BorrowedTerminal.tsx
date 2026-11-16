// A session's own terminal shown inside the overview — the list's in-place tray and the board's overlay. It is
// the same xterm on the same PTY as in the main area (terminal/borrow.ts), fully interactive, never a copy. A GUI
// session (PRD F23) has no terminal: its chat is drawn there instead, from the same store as the main area's card.
import { useEffect, useRef } from 'react'
import type { Session } from '@shared/types'
import { ChatPane } from '../gui/ChatPane'
import chatStyles from '../gui/Chat.module.css'
import { useWorkspace } from '../state/workspace'
import { borrowTerminal } from '../terminal/borrow'
import { useLiveSessions } from '../terminal/live-sessions'
import { getSurface } from '../terminal/registry'
import styles from './BorrowedTerminal.module.css'

/** The host: the overview leaves every key typed in there to the terminal (Esc included). */
export const TERMINAL_HOST_SELECTOR = '[data-overview-terminal]'

export function BorrowedTerminal({ session, variant }: { session: Session; variant: 'tray' | 'overlay' }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const live = useLiveSessions((s) => s.live[session.id] !== undefined)
  // Restored from disk and not started: there is no process to show until the session is entered.
  const held = session.phase === 'not-started' && !live

  const gui = session.ui === 'gui'
  const cwd = useWorkspace((s) => s.worktrees.find((w) => w.id === session.worktreeId)?.path) ?? window.tr.homeDir

  useEffect(() => {
    const host = hostRef.current
    if (held || gui || !host) return
    return borrowTerminal(session.id, host)
  }, [session.id, held, gui])

  if (held) return <p className={styles.held}>这个会话还没有启动。进入会话（↵）后启动。</p>
  if (gui) {
    return (
      // Keys typed in the chat are the session's, as in a terminal (Enter sends, Esc interrupts).
      <div className={styles.chatHost} data-variant={variant} data-overview-terminal="">
        <div className={`${chatStyles.pane} ${styles.chat}`} data-shown data-session-id={session.id}>
          <ChatPane sessionId={session.id} agent={session.kind} cwd={cwd} />
        </div>
      </div>
    )
  }
  return (
    <div
      ref={hostRef}
      className={styles.host}
      data-variant={variant}
      data-overview-terminal=""
      onClick={() => getSurface(session.id)?.focus()}
    />
  )
}
