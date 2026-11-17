// Web pages in a GUI session (PRD F23, Figma 90B): a search's results by title, a fetched page by its title when a
// search in the conversation found it, a link by its site. Pure.
import type { ChatItem } from '@shared/transcript-chat'

/** `https://www.webkit.org/a/b` → `webkit.org`; the text itself when it is not a URL. */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** `https://webkit.org/tracking-prevention/` → `webkit.org/tracking-prevention`: a URL short enough for a row. */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}`
  } catch {
    return url
  }
}

/** The title of every page the conversation's searches found, by URL (the first title wins). */
export function pageTitles(items: readonly ChatItem[]): ReadonlyMap<string, string> {
  const titles = new Map<string, string>()
  for (const item of items) {
    if (item.kind !== 'tool' || !item.links) continue
    for (const link of item.links) if (!titles.has(link.url)) titles.set(link.url, link.title)
  }
  return titles
}
