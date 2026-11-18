// Settings · Worktree (Figma 16A): where new port blocks start (already-assigned directories keep their block;
// applySettingsPatch clamps the number), and whether a worktree archives itself once its merge chain reaches 归档 (PRD
// F15; pull-requests/auto-archive.ts).
import { useRef, useState } from 'react'
import { PORT_BASE_LIMITS } from '@shared/ports'
import { defineMessages } from '@shared/i18n'
import { useMessages } from '../ui/i18n'
import { Row, Section, Toggle } from './controls'
import styles from './WorktreePane.module.css'

const M = defineMessages({
  zh: {
    ports: '端口',
    basePort: '起始端口',
    portsHint: '每个目录分到 10 个连续端口。TR_PORT 是其中的第一个。已经分过的目录仍用原来的一段；改起点只影响之后新分的目录。',
    archive: '归档',
    archiveAfterMerge: '合并后自动归档'
  },
  en: {
    ports: 'Ports',
    basePort: 'First port',
    portsHint:
      'Each folder gets 10 consecutive ports; TR_PORT is the first of them. Folders that already have a block keep it; changing the start only affects folders assigned later.',
    archive: 'Archive',
    archiveAfterMerge: 'Archive after merge'
  }
})

export function WorktreePane({
  base,
  update,
  archiveAfterMerge,
  updateArchiveAfterMerge
}: {
  base: number
  update: (base: number) => void
  archiveAfterMerge: boolean
  updateArchiveAfterMerge: (on: boolean) => void
}) {
  const m = useMessages(M)
  return (
    <div className={styles.page}>
      <div className={styles.form}>
        <h1 className={styles.title}>Worktree</h1>
        <Section title={m.ports}>
          <Row label={m.basePort}>
            <PortField value={base} onCommit={update} />
          </Row>
          <p className={styles.hint}>{m.portsHint}</p>
        </Section>
        <Section title={m.archive}>
          <Row label={m.archiveAfterMerge}>
            <Toggle label={m.archiveAfterMerge} checked={archiveAfterMerge} onChange={updateArchiveAfterMerge} />
          </Row>
        </Section>
      </div>
    </div>
  )
}

function PortField({ value, onCommit }: { value: number; onCommit: (base: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const skipBlur = useRef(false)
  const m = useMessages(M)
  const shown = draft ?? String(value)
  const commit = (text: string): void => {
    if (!/^\d+$/.test(text)) {
      setDraft(null)
      return
    }
    const next = Number(text)
    if (next !== value) onCommit(next)
    setDraft(null)
  }
  return (
    <input
      className={styles.port}
      inputMode="numeric"
      aria-label={m.basePort}
      autoComplete="off"
      spellCheck={false}
      min={PORT_BASE_LIMITS.min}
      max={PORT_BASE_LIMITS.max}
      value={shown}
      onChange={(event) => setDraft(event.currentTarget.value.replace(/\D/g, '').slice(0, 5))}
      onBlur={() => {
        if (skipBlur.current) {
          skipBlur.current = false
          return
        }
        commit(shown)
      }}
      onKeyDown={(event) => {
        // Enter / Esc while an input method composes confirm / cancel the composition.
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Enter') event.currentTarget.blur()
        else if (event.key === 'Escape') {
          skipBlur.current = true
          setDraft(null)
          event.currentTarget.blur()
        }
      }}
    />
  )
}
