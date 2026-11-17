// Highlighted code lines (Figma 90C): highlight.ts's tokens as spans that Chat.module.css colors by scope.
import type { Token } from './highlight'
import styles from './Chat.module.css'

export function Tokens({ tokens }: { tokens: readonly Token[] }) {
  return (
    <>
      {tokens.map((token, i) =>
        token.kind ? (
          <span key={i} className={styles.hl} data-hl={token.kind}>
            {token.text}
          </span>
        ) : (
          token.text
        )
      )}
    </>
  )
}
