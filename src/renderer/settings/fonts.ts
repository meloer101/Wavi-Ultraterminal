// Font catalog helpers for the settings window: turn the raw list of installed faces into the
// menus (Latin monospace and CJK-capable for the terminal; Latin proportional for 对话, PRD v1.127). Pure; the DOM-dependent bits live in local-fonts.ts.
import { defineMessages, pick } from '@shared/i18n'

/** Always offered, even when the Local Font Access API is denied or the family is not installed. */
export const BUNDLED_LATIN_FONT = 'JetBrains Mono Variable'
export const DEFAULT_CJK_FONT = 'PingFang SC'

export const LATIN_SAMPLE = 'AaBb 0O1l'
// eslint-disable-next-line no-restricted-syntax -- CJK font sample: shows the Chinese font in both languages
export const CJK_SAMPLE = '中文字体'

export interface FontCatalog {
  latin: string[]
  cjk: string[]
  /** Proportional Latin families: 设置 · 外观 · 对话 · 英文字体 (the terminal's menu keeps monospace ones). */
  ui: string[]
}

const MONO_NAME =
  /mono|code|consol|courier|menlo|monaco|hack|fira|iosevka|cascadia|inconsolata|cousine|terminal|typewriter|meslo|nerd|berkeley|input|maple|commit|fantasque|victor|hasklig|anonymous|ibm 3270|\bpt mono\b|\bgeist\b/i

const CJK_NAME =
  // eslint-disable-next-line no-restricted-syntax -- matches CJK font family names, not UI text
  /pingfang|hiragino|noto (sans|serif) (cjk|sc|tc|hk|jp|kr)|source han|思源|cjk|\b(sc|tc|hc|hk|jp|kr)\b|heiti|songti|kaiti|fangsong|yuanti|wenquanyi|microsoft ya ?hei|simsun|simhei|stheiti|stsong|stkaiti|stfangsong|lantinghei|libian|hannotate|hanzipen|weibei|xingkai|yapi|baoli|lisong|apple (sd )?gothic|nanum|malgun|meiryo|yu (gothic|mincho)|pmingliu|mingliu|dfkai|lihei|[黑宋楷圆體体]/i

/** Name-based guess: does this family look like a monospace face? */
export function looksMonospace(family: string): boolean {
  return MONO_NAME.test(family)
}

/** Name-based guess: is this family meant for CJK text? */
export function looksCjk(family: string): boolean {
  return CJK_NAME.test(family)
}

/** Drops hidden system faces (leading dot), blanks and duplicates; sorts case-insensitively. */
export function uniqueFamilies(families: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const raw of families) {
    const family = raw.trim()
    if (family === '' || family.startsWith('.')) continue
    seen.add(family)
  }
  return [...seen].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * Splits installed families into the two menus. `isMonospace` is the measured check (canvas): when it is
 * available it alone decides, so proportional faces whose names sound like code fonts ("Fira Sans",
 * "American Typewriter", "Geist") stay out of the English menu (B15); the name guess is only the fallback.
 * The bundled and default families are always present and pinned first.
 */
export function classifyFonts(families: readonly string[], isMonospace?: (family: string) => boolean): FontCatalog {
  const cjk: string[] = []
  const latin: string[] = []
  const ui: string[] = []
  const monospace = isMonospace ?? looksMonospace
  for (const family of uniqueFamilies(families)) {
    if (looksCjk(family)) cjk.push(family)
    else if (monospace(family)) latin.push(family)
    else ui.push(family)
  }
  return {
    latin: pinFirst(latin, BUNDLED_LATIN_FONT),
    cjk: pinFirst(cjk, DEFAULT_CJK_FONT),
    ui
  }
}

const M_GROUP = defineMessages({
  zh: { simplified: '简体中文', traditional: '繁体中文', japanese: '日文', korean: '韩文', other: '其他' },
  en: { simplified: 'Simplified Chinese', traditional: 'Traditional Chinese', japanese: 'Japanese', korean: 'Korean', other: 'Other' }
})

type CjkGroupKey = keyof (typeof M_GROUP)['zh']
/** A group's name in the current language. */
export type CjkGroup = string

export const CJK_GROUP_ORDER: readonly CjkGroupKey[] = ['simplified', 'traditional', 'japanese', 'korean', 'other']

// eslint-disable-next-line no-restricted-syntax -- matches CJK font family names, not UI text
const TRADITIONAL = /\b(tc|hk|hc)\b|繁|[體]|pmingliu|mingliu|dfkai|lihei|lisong|apple lisung/i
// eslint-disable-next-line no-restricted-syntax -- matches CJK font family names, not UI text
const SIMPLIFIED = /\b(sc|gb)\b|简|[体]|pingfang|heiti|songti|kaiti|fangsong|yuanti|st(heiti|song|kaiti|fangsong|xihei)|microsoft ya ?hei|simsun|simhei|wenquanyi|lantinghei|思源/i
// eslint-disable-next-line no-restricted-syntax -- matches CJK font family names, not UI text
const JAPANESE = /\bjp\b|hiragino (sans|mincho|kaku|maru)|osaka|meiryo|yu (gothic|mincho)|ms (p?gothic|p?mincho)|ヒラギノ|游/i
const KOREAN = /\bkr\b|apple ?(sd )?gothic|applemyungjo|nanum|malgun|batang|gulim|dotum|한/i

/** Which language a CJK family is drawn for, by name: the Chinese font menu is grouped by this (B15). */
function cjkGroupKey(family: string): CjkGroupKey {
  if (TRADITIONAL.test(family)) return 'traditional'
  if (SIMPLIFIED.test(family)) return 'simplified'
  if (JAPANESE.test(family)) return 'japanese'
  if (KOREAN.test(family)) return 'korean'
  return 'other'
}

export function cjkGroup(family: string): CjkGroup {
  return pick(M_GROUP)[cjkGroupKey(family)]
}

/** The families in CJK_GROUP_ORDER, keeping their order (pinned default first) within each group. */
export function groupCjkFamilies(families: readonly string[]): { family: string; group: CjkGroup }[] {
  const names = pick(M_GROUP)
  const tagged = families.map((family) => ({ family, key: cjkGroupKey(family) }))
  return CJK_GROUP_ORDER.flatMap((key) => tagged.filter((entry) => entry.key === key).map(({ family }) => ({ family, group: names[key] })))
}

function pinFirst(list: readonly string[], pinned: string): string[] {
  return [pinned, ...list.filter((family) => family !== pinned)]
}

/** CSS font-family list that renders `family` first and always names an explicit fallback. */
export function cssFamily(family: string, fallback: string): string {
  return `"${family.replace(/["\\]/g, '')}", ${fallback}`
}

/** Makes sure the currently selected family is selectable even when it is not in the catalog. */
export function withCurrent(list: readonly string[], current: string): string[] {
  return list.includes(current) ? [...list] : [current, ...list]
}
