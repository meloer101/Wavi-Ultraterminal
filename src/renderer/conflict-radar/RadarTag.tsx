// The conflict radar's mark: "和 jacob/otter 会冲突" · "和 main 会冲突" · "main 已前进 · 落后 3", or just 冲突 / 落后 in the
// Worktree view's last column (`short`, Figma 85B″). The icon's shape says which (an octagon alert for a conflict, an
// arrow for a base that moved on) and so does the text; only the icon has color. Every pair and file is in the tooltip
// and the accessible name.
import { memo } from 'react'
import { ArrowDown, OctagonAlert } from 'lucide-react'
import type { RadarMark } from '@shared/conflict-radar'
import { defineMessages } from '@shared/i18n'
import { useLang, useMessages } from '../i18n'
import { useSessionRadarMark } from './store'
import styles from './RadarTag.module.css'

const MARK_ICON = { size: 12, strokeWidth: 2, 'aria-hidden': true } as const

const M = defineMessages<{ short: Record<RadarMark['tone'], string> }>({
  zh: { short: { conflict: '冲突', behind: '落后' } },
  en: { short: { conflict: 'Conflict', behind: 'Behind' } }
})

export function RadarTag({ mark, short = false }: { mark: RadarMark; short?: boolean }) {
  const m = useMessages(M)
  return (
    <span className={styles.tag} data-tone={mark.tone} data-testid="radar-tag" title={mark.detail} aria-label={mark.detail}>
      <span className={styles.icon}>{mark.tone === 'conflict' ? <OctagonAlert {...MARK_ICON} /> : <ArrowDown {...MARK_ICON} />}</span>
      <span className={styles.label}>{short ? m.short[mark.tone] : mark.label}</span>
    </span>
  )
}

export const SessionRadarTag = memo(function SessionRadarTag({ sessionId }: { sessionId: string }) {
  // Memo'd: the mark's label is built outside React, so this re-renders on a language switch itself.
  useLang()
  const mark = useSessionRadarMark(sessionId)
  return mark ? <RadarTag mark={mark} /> : null
})
