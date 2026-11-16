// The interface language in this window (Figma 89): main resolves it (main/language.ts) and preload hands it over
// before the first render, so the page never flashes the other language. Components read their strings with
// useMessages, which re-renders them when the language changes; code outside React calls pick() at use time.
import { useSyncExternalStore } from 'react'
import { getLang, langTag, onLangChange, setLang, type Lang, type Messages } from '@shared/i18n'

function apply(lang: Lang): void {
  setLang(lang)
  document.documentElement.lang = langTag(lang)
}

/** Once, before the first render. */
export function initLanguage(): void {
  apply(window.tr.app.language)
  window.tr.app.onLanguage(apply)
}

export function useLang(): Lang {
  return useSyncExternalStore(onLangChange, getLang)
}

/** A component's strings in the current language. */
export function useMessages<T>(messages: Messages<T>): T {
  return messages[useLang()]
}
