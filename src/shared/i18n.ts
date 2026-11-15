// Interface language (PRD §5 语言, Figma 89): every user-facing string lives next to the code that shows it, in a
// `defineMessages({ zh, en })` table, and is picked for the current language when it is used. Each process (main,
// every renderer) holds one current language: main resolves it from 设置 · 外观 · 语言 and the system's preferred
// languages and sends it to the windows. Pure and dependency-free so main, renderer and shared logic all use it.
//
// Agent output, terminal contents, file paths, model and command names are never translated.

export type Lang = 'zh' | 'en'
/** 设置 · 外观 · 界面语言: 跟随系统, or one language. */
export type LanguagePreference = 'system' | Lang

export const LANGS: readonly Lang[] = ['zh', 'en']

export function isLang(value: unknown): value is Lang {
  return value === 'zh' || value === 'en'
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'system' || isLang(value)
}

/**
 * The language to show: the setting, or for 跟随系统 the first of the system's preferred languages (BCP 47, most
 * preferred first) that Wavi has — Chinese of any script or region is `zh`, English is `en`. Anything else is `en`.
 */
export function resolveLang(preference: LanguagePreference, preferred: readonly string[]): Lang {
  if (preference !== 'system') return preference
  for (const tag of preferred) {
    const base = tag.toLowerCase().split(/[-_]/)[0]
    if (base === 'zh') return 'zh'
    if (base === 'en') return 'en'
  }
  return 'en'
}

/** The tag for `<html lang>` and Intl formatting. */
export function langTag(lang: Lang): string {
  return lang === 'zh' ? 'zh-CN' : 'en'
}

// Chinese is the language the app was written in; tests and code that never set a language keep seeing it.
let current: Lang = 'zh'
const listeners = new Set<(lang: Lang) => void>()

export function getLang(): Lang {
  return current
}

/** Sets this process's language; listeners run only when it changes. */
export function setLang(lang: Lang): void {
  if (lang === current) return
  current = lang
  for (const listener of listeners) listener(lang)
}

export function onLangChange(listener: (lang: Lang) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Runs `fn` with `lang` as the current language and restores the previous one: text built for someone else, such
 * as the phone, which shows its own language (PRD F22). Synchronous only — the language is process-wide.
 */
export function withLang<T>(lang: Lang, fn: () => T): T {
  const previous = current
  current = lang
  try {
    return fn()
  } finally {
    current = previous
  }
}

/** One table of strings (or functions that build them) per language; `en` must have exactly `zh`'s shape. */
export interface Messages<T> {
  readonly zh: T
  readonly en: T
}

/**
 * Declares a component's or module's strings. Chinese and English sit side by side and the type checker holds `en`
 * to `zh`'s keys and parameters. The lint rule that keeps Chinese out of code allows it inside this call only.
 */
export function defineMessages<T extends object>(messages: { zh: T; en: NoInfer<T> }): Messages<T> {
  return messages
}

/** The table for the current language. Call it where the text is used, not at module load. */
export function pick<T>(messages: Messages<T>): T {
  return messages[current]
}

/**
 * A table that always reads the current language, for an exported constant other modules index into
 * (`STATUS_LABEL[status]`, `Object.entries(…)`): its callers keep working unchanged. Read-only.
 */
export function localized<T extends object>(messages: Messages<T>): T {
  return new Proxy(messages.zh, {
    get: (_target, key) => (messages[current] as Record<PropertyKey, unknown>)[key],
    has: (_target, key) => key in messages[current],
    ownKeys: () => Reflect.ownKeys(messages[current]),
    getOwnPropertyDescriptor: (_target, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(messages[current], key)
      return descriptor && { ...descriptor, configurable: true }
    },
    set: () => false,
    deleteProperty: () => false
  })
}
