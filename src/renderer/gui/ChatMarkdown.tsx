// The agent's words in a GUI session (PRD F23, Figma 49″C): Markdown with GFM, the same element styles as the files
// view's preview (panels/files/MarkdownView), at the chat's reading size. Raw HTML is not rendered (the sanitize
// schema drops what would run); a link opens in the built-in browser, ⌘-click in the system one. A code block has a
// copy button in its corner on hover (Figma 54B).
import { Fragment, memo, useMemo, type MouseEvent, type ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { defineMessages } from '@shared/i18n'
import type { SessionId } from '@shared/types'
import { openLink } from '../state/link-actions'
import { CopyButton } from './CopyButton'
import { highlightLines } from './highlight'
import { Tokens } from './Highlighted'
import { useMessages } from '../ui/i18n'
import styles from './Chat.module.css'

const M = defineMessages({
  zh: { copyCode: '复制代码' },
  en: { copyCode: 'Copy code' }
})

const REMARK = [remarkGfm]
const REHYPE = [rehypeSanitize]

/** A Markdown (hast) node's text: a code block's source. */
function hastText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as { type?: string; value?: string; children?: unknown[] }
  return n.type === 'text' ? (n.value ?? '') : (n.children ?? []).map(hastText).join('')
}

/** A fenced block's language: its code element's `language-*` class (sanitize keeps only that one). */
function languageOf(pre: unknown): string | undefined {
  const code = (pre as { children?: { tagName?: string; properties?: { className?: unknown } }[] } | undefined)?.children?.find((c) => c.tagName === 'code')
  const names = code?.properties?.className
  const name = Array.isArray(names) ? names.find((n): n is string => typeof n === 'string' && n.startsWith('language-')) : undefined
  return name?.slice('language-'.length)
}

/** Figma 90C: a fenced block colored by its language; as written when none is given or known. */
function CodeBlock({ node, children }: { node: unknown; children: ReactNode }) {
  const language = languageOf(node)
  const code = hastText(node).replace(/\n$/, '')
  const lines = useMemo(() => (language ? highlightLines(code, language) : null), [code, language])
  if (!lines) return <pre>{children}</pre>
  return (
    <pre>
      <code>
        {lines.map((tokens, i) => (
          <Fragment key={i}>
            {i > 0 && '\n'}
            <Tokens tokens={tokens} />
          </Fragment>
        ))}
      </code>
    </pre>
  )
}

export const ChatMarkdown = memo(function ChatMarkdown({ sessionId, text, className }: { sessionId: SessionId; text: string; className?: string }) {
  const m = useMessages(M)
  const components: Components = {
    a: ({ href, children }) => (
      <a
        href={href}
        title={href}
        onClick={(e: MouseEvent<HTMLAnchorElement>) => {
          e.preventDefault()
          if (href && /^https?:\/\//i.test(href)) openLink(sessionId, href, e.metaKey ? 'external' : 'internal')
        }}
      >
        {children}
      </a>
    ),
    pre: ({ node, children }) => (
      <div className={styles.codeWrap}>
        <CodeBlock node={node}>{children}</CodeBlock>
        <CopyButton text={() => hastText(node).replace(/\n$/, '')} label={m.copyCode} className={styles.cornerCopy} />
      </div>
    )
  }
  return (
    <div className={[styles.markdown, className].filter(Boolean).join(' ')}>
      <Markdown remarkPlugins={REMARK} rehypePlugins={REHYPE} components={components}>
        {text}
      </Markdown>
    </div>
  )
})
