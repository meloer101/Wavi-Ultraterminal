// A session's own terminal shown inside 看板 · 进度's overlay. It is
// the same xterm on the same PTY as in the main area (terminal/borrow.ts), fully interactive, never a copy. A GUI
// session (PRD F23) has no terminal: its chat is drawn there instead, from the same store as the main area's card.
import { useEffect, useRef } from 'react'
import { defineMessages } from '@shared/i18n'
import type { Session } from '@shared/types'
import { GuiCard } from '../gui/GuiPane'
import { useGuiSessions } from '../gui/store'
import { useWorkspace } from '../state/workspace'
import { useWorktreeCreations } from '../new-session/creation'
import { useMessages } from '../ui/i18n'
import { borrowTerminal } from '../terminal/borrow'
import { useLiveSessions } from '../terminal/live-sessions'
import { getSurface } from '../terminal/registry'
import styles from './BorrowedTerminal.module.css'

const M = defineMessages({
  zh: { held: '这个会话还没有启动。进入会话（↵）后启动。' },
  en: { held: "This session hasn't started. It starts when you enter it (↵)." }
})

/** The host: the overview leaves every key typed in there to the terminal (Esc included). */
export const TERMINAL_HOST_SELECTOR = '[data-overview-terminal]'

export function BorrowedTerminal({ session, variant }: { session: Session; variant: 'overlay' }) {
  const m = useMessages(M)
  const hostRef = useRef<HTMLDivElement>(null)
  const live = useLiveSessions((s) => s.live[session.id] !== undefined)
  const gui = session.ui === 'gui'
  // A GUI session's chat is drawn once main has opened it; until then (restored and not started, its worktree still
  // being made, or simply not opened in any window) the overlay says so rather than offer a composer that goes nowhere.
  const opened = useGuiSessions((s) => s.states[session.id] !== undefined)
  const makingWorktree = useWorktreeCreations((s) => s.held[session.id] !== undefined)
  // A terminal restored from disk and not started has no process to show until the session is entered.
  const held = gui ? session.phase === 'not-started' || makingWorktree || !opened : session.phase === 'not-started' && !live
  const cwd = useWorkspace((s) => s.worktrees.find((w) => w.id === session.worktreeId)?.path) ?? window.tr.homeDir

  useEffect(() => {
    const host = hostRef.current
    if (held || gui || !host) return
    return borrowTerminal(session.id, host)
  }, [session.id, held, gui])

  if (held) return <p className={styles.held}>{m.held}</p>
  if (gui) {
    return (
      // Keys typed in the chat are the session's, as in a terminal (Enter sends, Esc interrupts).
      <div className={styles.chatHost} data-variant={variant} data-overview-terminal="">
        <GuiCard sessionId={session.id} agent={session.kind} cwd={cwd} active rect={undefined} bare />
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
