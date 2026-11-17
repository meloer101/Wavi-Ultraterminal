// Web pages in a GUI session (PRD F23, Figma 90B). A link in the agent's words opens in the built-in browser (⌘-click:
// the system one); resting on it shows its site, its title when a search in the conversation found it, and its URL.
// A search's results are listed under its row, a title and a site each.
import { createContext, useContext, useRef, type MouseEvent, type ReactNode } from 'react'
import { ExternalLink, Globe } from 'lucide-react'
import type { ChatLink } from '@shared/transcript-chat'
import type { SessionId } from '@shared/types'
import { openLink } from '../state/link-actions'
import { HoverCard, useHoverCard } from './HoverCard'
import { siteOf } from './web-links'
import styles from './Chat.module.css'

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

/** The titles the conversation's searches found, by URL (Feed). */
export const PageTitles = createContext<ReadonlyMap<string, string>>(new Map())

const target = (event: MouseEvent): 'internal' | 'external' => (event.metaKey ? 'external' : 'internal')

export function WebLink({ sessionId, href, children }: { sessionId: SessionId; href: string; children: ReactNode }) {
  const titles = useContext(PageTitles)
  const anchor = useRef<HTMLAnchorElement>(null)
  const { open, hover, close } = useHoverCard()
  const title = titles.get(href)
  return (
    <>
      <a
        ref={anchor}
        href={href}
        onClick={(event) => {
          event.preventDefault()
          close()
          openLink(sessionId, href, target(event))
        }}
        {...hover}
      >
        {children}
      </a>
      {open && (
        <HoverCard anchor={anchor} hover={hover} onClose={close} className={styles.webCard} testId="gui-web-card">
          <span className={styles.webSite}>
            <Globe {...ICON} />
            {siteOf(href)}
          </span>
          {title && <span className={styles.webTitle}>{title}</span>}
          <span className={styles.webUrl}>{href}</span>
        </HoverCard>
      )}
    </>
  )
}

/** Figma 90B: a search's results under its row — title · site, the row under the pointer with ↗. */
export function SearchResults({ sessionId, links }: { sessionId: SessionId; links: readonly ChatLink[] }) {
  return (
    <ul className={styles.searchResults} data-testid="gui-search-results">
      {links.map((link, i) => (
        <li key={`${i}:${link.url}`}>
          <a href={link.url} className={styles.searchResult} title={link.url} onClick={(event) => {
              event.preventDefault()
              openLink(sessionId, link.url, target(event))
            }}>
            <span className={styles.searchTitle}>{link.title}</span>
            <span className={styles.searchSite}>{siteOf(link.url)}</span>
            <ExternalLink {...ICON} className={styles.searchOpen} />
          </a>
        </li>
      ))}
    </ul>
  )
}
