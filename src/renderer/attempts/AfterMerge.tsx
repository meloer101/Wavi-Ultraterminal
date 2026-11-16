// 同任务多解 after one member was merged (PRD F4 / F15 v1.59): the merge sheet's result lists the members still left
// and offers to archive them. Nothing is archived before the confirmation that names every branch.
import { useEffect, useRef, useState } from 'react'
import { Archive } from 'lucide-react'
import { defineMessages } from '@shared/i18n'
import { useMessages } from '../ui/i18n'
import { useAttemptGroups } from '../state/attempt-groups'
import { useWorkspace } from '../state/workspace'
import { archiveRemaining, remainingBranches } from './actions'
import styles from './AfterMerge.module.css'

const M = defineMessages({
  zh: {
    notArchived: (failures: string[]) => `没有归档：${failures.join('；')}`,
    archived: '已归档其余几份，可以在跳转（⌘K）的历史里恢复',
    left: (n: number, branches: string[]) => `同任务多解还剩 ${n} 份：${branches.join('、')}`,
    archiving: '正在归档…',
    archiveRest: (n: number) => `归档其余 ${n} 份`
  },
  en: {
    notArchived: (failures: string[]) => `Not archived: ${failures.join('; ')}`,
    archived: 'Archived the other tries; restore them from History in Jump to (⌘K)',
    left: (n: number, branches: string[]) => `${n === 1 ? '1 try' : `${n} tries`} of the same task left: ${branches.join(', ')}`,
    archiving: 'Archiving…',
    archiveRest: (n: number) => (n === 1 ? 'Archive the other 1' : `Archive the other ${n}`)
  }
})

export function AfterMerge({ groupId }: { groupId: string }) {
  const m = useMessages(M)
  const group = useAttemptGroups((s) => s.groups.find((g) => g.id === groupId))
  // Re-read the members whenever sessions or worktrees change (one archived, one closed).
  useWorkspace((s) => s.worktrees)
  useWorkspace((s) => s.sessions.length)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  // The button goes away with the members (and archiving moves terminals): the keyboard comes back to the sheet,
  // so Esc and ⌘↵ 完成 still work.
  useEffect(() => {
    if (!outcome) return
    const frame = requestAnimationFrame(() => ref.current?.closest<HTMLElement>('[role="dialog"]')?.focus())
    return () => cancelAnimationFrame(frame)
  }, [outcome])
  const left = group ? remainingBranches(group) : []
  if (!group || (left.length === 0 && !outcome)) return null

  const archive = async (): Promise<void> => {
    setBusy(true)
    const result = await archiveRemaining(group)
    setBusy(false)
    if (!result.confirmed) return
    setOutcome(result.failures.length > 0 ? m.notArchived(result.failures) : m.archived)
  }

  return (
    <div ref={ref} className={styles.offer} data-testid="attempt-after-merge">
      <Archive size={16} strokeWidth={1.75} aria-hidden className={styles.icon} />
      <span className={styles.text}>
        {outcome ?? m.left(left.length, left.map((b) => b.branch))}
      </span>
      {left.length > 0 && (
        <button type="button" className={styles.button} disabled={busy} onClick={() => void archive()}>
          {busy ? m.archiving : m.archiveRest(left.length)}
        </button>
      )}
    </div>
  )
}
