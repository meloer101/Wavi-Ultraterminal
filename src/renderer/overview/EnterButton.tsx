// 进入会话 ↵ — Figma Button (9:33), ghost with its shortcut inline: the expanded list row and the overlay bar.
import { defineMessages } from '@shared/i18n'
import type { SessionId } from '@shared/types'
import { useMessages } from '../ui/i18n'
import { enterSession } from './store'
import styles from './EnterButton.module.css'

const M = defineMessages({ zh: { enter: '进入会话' }, en: { enter: 'Enter session' } })

export function EnterButton({ sessionId }: { sessionId: SessionId }) {
  const m = useMessages(M)
  return (
    <button
      type="button"
      className={styles.enter}
      onClick={(e) => {
        e.stopPropagation()
        enterSession(sessionId)
      }}
    >
      {m.enter}
      <span className={styles.key} aria-hidden>
        ↵
      </span>
    </button>
  )
}
