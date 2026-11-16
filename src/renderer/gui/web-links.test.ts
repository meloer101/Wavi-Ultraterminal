import { describe, expect, it } from 'vitest'
import type { ChatItem } from '@shared/transcript-chat'
import { pageTitles, shortUrl, siteOf } from './web-links'

describe('web links', () => {
  it('names a page by its site and a short URL', () => {
    expect(siteOf('https://www.webkit.org/tracking-prevention/')).toBe('webkit.org')
    expect(shortUrl('https://webkit.org/tracking-prevention/?a=1')).toBe('webkit.org/tracking-prevention')
    expect(siteOf('not a url')).toBe('not a url')
  })

  it('collects the titles the searches found', () => {
    const items: ChatItem[] = [
      { kind: 'tool', id: 'a', at: 0, name: 'WebSearch', arg: 'q', state: 'ok', links: [{ title: 'MDN', url: 'https://developer.mozilla.org/x' }] },
      { kind: 'tool', id: 'b', at: 0, name: 'WebSearch', arg: 'q', state: 'ok', links: [{ title: 'Other', url: 'https://developer.mozilla.org/x' }] }
    ]
    expect(pageTitles(items).get('https://developer.mozilla.org/x')).toBe('MDN')
  })
})
