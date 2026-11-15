// Pure helpers for find in the terminal (B18).
import { defineMessages, pick } from '@shared/i18n'

const M = defineMessages({ zh: { none: '无结果' }, en: { none: 'No results' } })

/** ⌘F (no other modifiers). */
export function isFindShortcut(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): boolean {
  return e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f'
}

/** "3/12", "无结果", or just the count when there are too many to number. */
export function findStatus(query: string, results: { resultIndex: number; resultCount: number } | null): string {
  if (query === '' || !results) return ''
  if (results.resultCount === 0) return pick(M).none
  return results.resultIndex < 0 ? `${results.resultCount}+` : `${results.resultIndex + 1}/${results.resultCount}`
}
