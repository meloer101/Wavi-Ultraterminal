// Pieces both merge sheets use (PRD F4 · F16 v1.63): a checklist line, the agent's own checks this turn, a checkbox.
import { Check, AlertCircle, CircleX, Minus } from '../../ui/icons'
import { runNote, type TurnCheckView } from '@shared/turn-checks'
import { defineMessages } from '@shared/i18n'
import { useMessages } from '../../ui/i18n'
import { CheckMark } from '../../turn-checks/TurnChecksTag'
import { StatusGlyph } from '../../ui/StatusGlyph'
import { turnChecksLine, type CheckLine, type testLine } from './model'
import styles from './MergeSheet.module.css'

const M = defineMessages({
  zh: {
    runs: '跑过的检查',
    more: (count: number) => `还有 ${count} 条`,
    rerun: '重新运行'
  },
  en: {
    runs: 'Checks that ran',
    more: (count: number) => `${count} more`,
    rerun: 'Run again'
  }
})

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

export function Line({ line }: { line: CheckLine }) {
  const icon =
    line.tone === 'ok' ? (
      <Check {...ICON} />
    ) : line.tone === 'warn' ? (
      <AlertCircle {...ICON} />
    ) : line.tone === 'working' ? (
      <StatusGlyph status="running" />
    ) : line.tone === 'muted' ? (
      <Minus {...ICON} />
    ) : (
      <CircleX {...ICON} />
    )
  return (
    <p className={styles.line} data-tone={line.tone}>
      <span className={styles.lineIcon} aria-hidden={line.tone === 'working'}>
        {icon}
      </span>
      <span className={styles.lineText}>{line.text}</span>
      {line.meta && <span className={styles.lineMeta}>{line.meta}</span>}
    </p>
  )
}

/** Most runs a turn has are listed; the rest are counted. */
const MAX_LISTED_RUNS = 6

/** The agent's own checks this turn: the line, then each command with its mark (the failing ones first). */
export function TurnChecks({ view, kind }: { view: TurnCheckView; kind: Parameters<typeof turnChecksLine>[1] }) {
  const m = useMessages(M)
  const order = { fail: 0, unknown: 1, pass: 2 } as const
  const runs = [...view.runs].sort((a, b) => order[a.outcome] - order[b.outcome] || a.at - b.at)
  return (
    <>
      <Line line={turnChecksLine(view, kind)} />
      {runs.length > 0 && (
        <ul className={styles.runs} aria-label={m.runs} data-testid="merge-turn-checks">
          {runs.slice(0, MAX_LISTED_RUNS).map((run) => {
            const note = runNote(run)
            return (
              <li key={`${run.kind} ${run.command}`} className={styles.run}>
                <CheckMark outcome={run.outcome} />
                <span className={styles.runCommand}>{run.command}</span>
                {note && <span className={styles.runNote}>{note}</span>}
              </li>
            )
          })}
          {runs.length > MAX_LISTED_RUNS && <li className={styles.conflictMore}>{m.more(runs.length - MAX_LISTED_RUNS)}</li>}
        </ul>
      )}
    </>
  )
}

export function TestResult({ line, onRerun }: { line: ReturnType<typeof testLine>; onRerun(): void }) {
  const m = useMessages(M)
  return (
    <>
      <Line line={line} />
      {line.output && <pre className={styles.output}>{line.output}</pre>}
      {line.rerun && (
        <button type="button" className={styles.rerun} onClick={onRerun}>
          {m.rerun}
        </button>
      )}
    </>
  )
}

export function Checkbox({
  checked,
  disabled,
  onChange,
  label,
  note
}: {
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
  label: string
  note: string | null
}) {
  return (
    <div className={styles.checkboxRow}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        className={styles.checkbox}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.box} aria-hidden>
          {checked && <Check size={12} strokeWidth={2.5} />}
        </span>
        {label}
      </button>
      {note && <p className={styles.note}>{note}</p>}
    </div>
  )
}
