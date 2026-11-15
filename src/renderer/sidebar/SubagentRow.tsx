import { memo } from 'react'
import { defineMessages } from '@shared/i18n'
import type { SessionId } from '@shared/types'
import { useMessages } from '../i18n'
import { StatusGlyph } from '../ui/StatusGlyph'
import { sameSubagent, type SubagentRowModel } from './model'
import styles from './SubagentRow.module.css'

const M = defineMessages({ zh: { pending: '待开始' }, en: { pending: 'Waiting to start' } })

interface Props {
  row: SubagentRowModel
  /** Selects the session the subagent runs in: the subagent itself is no session. */
  onSelect(id: SessionId): void
  /** A workflow run's row folds or unfolds its phases (Figma 74D). */
  onToggle?(id: string): void
}

/**
 * Figma 44B SubagentRow: a subagent the agent started inside its session — one line (status · task · model), hung
 * under the session on the tree line. Display only: no branch, no agent mark, no keyboard stop (PRD F21 v1.109).
 */
export const SubagentRow = memo(
  function SubagentRow({ row, onSelect, onToggle }: Props) {
    const m = useMessages(M)
    // Figma 74D: a workflow run (state · name · current phase done / all) and its phases hang here like subagents;
    // Figma 83B: so does a session a `wavi run` asked for, until the user answers (a click opens the session that asked);
    // Figma 82′F: and Claude's agent team, a 队伍 · N 人 line and two lines per teammate.
    const folds = row.kind === 'workflow' && onToggle
    return (
      <div
        className={styles.row}
        data-testid={row.kind ? `${row.kind}-row` : 'subagent-row'}
        data-agent-id={row.id}
        data-kind={row.kind}
        data-depth={row.depth}
        data-tree={row.tree}
        data-attention={row.attention}
        onClick={() => (folds ? onToggle(row.id) : onSelect(row.sessionId))}
      >
        <span className={styles.line}>
          {row.kind !== 'team' && (
            <span className={styles.glyph}>
              {row.kind === 'pending' ? (
                <span className={styles.pendingGlyph} aria-label={m.pending} />
              ) : (
                <StatusGlyph status={row.glyph ?? (row.attention ? 'needs_you' : 'running')} />
              )}
            </span>
          )}
          <span className={styles.title}>{row.title}</span>
          {(row.right ?? row.model) && <span className={styles.model}>{row.right ?? row.model}</span>}
        </span>
        {row.detail !== undefined && <span className={styles.detail}>{row.detail}</span>}
        {row.pass && <span className={styles.pass} aria-hidden />}
      </div>
    )
  },
  (a, b) => sameSubagent(a.row, b.row) && a.row.sessionId === b.row.sessionId && a.onSelect === b.onSelect && a.onToggle === b.onToggle
)
