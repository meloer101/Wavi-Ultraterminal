// A test command's results under its row (PRD F23, Figma 90D): each failure (✕ · name · its place, a link) with its
// first lines, expected in green and received in red; the passed ones as one row; the whole output behind 完整输出.
import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, Terminal, X } from 'lucide-react'
import { defineMessages } from '@shared/i18n'
import { useMessages } from '../ui/i18n'
import { codeRef } from './file-refs'
import { FileRef } from './FileRef'
import type { TestResults as Results } from './test-results'
import styles from './Chat.module.css'

const M = defineMessages({
  zh: { passed: (n: number) => `${n} 个通过`, output: '完整输出' },
  en: { passed: (n: number) => `${n} passed`, output: 'Full output' }
})

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

/** An expected / received line: vitest's `- Expected` / `+ Received`, jest's `Expected:` / `Received:`. */
function lineKind(line: string): 'expected' | 'received' | undefined {
  if (/^(-|Expected\b)/.test(line)) return 'expected'
  if (/^(\+|Received\b)/.test(line)) return 'received'
  return undefined
}

export function TestResults({ results, output }: { results: Results; output: ReactNode }) {
  const m = useMessages(M)
  const [raw, setRaw] = useState(false)
  return (
    <div className={styles.testResults} data-testid="gui-test-results">
      {results.failures.map((failure, i) => {
        const place = failure.location ? codeRef(failure.location) : null
        return (
          <div key={i} className={styles.testFailure}>
            <div className={styles.testHead}>
              <X {...ICON} className={styles.testFailed} />
              <span className={styles.testName}>{failure.name}</span>
              {failure.location && <span className={styles.testPlace}>{place ? <FileRef target={place}>{failure.location}</FileRef> : failure.location}</span>}
            </div>
            {failure.message.length > 0 && (
              <pre className={styles.testMessage}>
                {failure.message.map((line, j) => (
                  <span key={j} data-kind={lineKind(line)}>
                    {line}
                    {'\n'}
                  </span>
                ))}
              </pre>
            )}
          </div>
        )
      })}
      {results.passed > 0 && (
        <div className={styles.testHead}>
          <Check {...ICON} className={styles.testPassed} />
          <span className={styles.testMeta}>{m.passed(results.passed)}</span>
        </div>
      )}
      <button type="button" className={styles.testHead} aria-expanded={raw} onClick={() => setRaw(!raw)}>
        <Terminal {...ICON} />
        <span className={styles.testMeta}>{m.output}</span>
        {raw ? <ChevronDown {...ICON} className={styles.rowChevron} /> : <ChevronRight {...ICON} className={styles.rowChevron} />}
      </button>
      {raw && output}
    </div>
  )
}
