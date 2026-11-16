import { afterEach, describe, expect, it } from 'vitest'
import { defineMessages, getLang, localized, onLangChange, pick, resolveLang, setLang, withLang } from './i18n'

afterEach(() => setLang('zh'))

describe('resolveLang', () => {
  it('uses the setting when it names a language', () => {
    expect(resolveLang('en', ['zh-Hans-CN'])).toBe('en')
    expect(resolveLang('zh', ['en-US'])).toBe('zh')
  })

  it('follows the first preferred language Wavi has', () => {
    expect(resolveLang('system', ['zh-Hant-TW', 'en-US'])).toBe('zh')
    expect(resolveLang('system', ['fr-FR', 'en-GB', 'zh-Hans'])).toBe('en')
    expect(resolveLang('system', ['de-DE', 'zh_CN'])).toBe('zh')
  })

  it('falls back to English', () => {
    expect(resolveLang('system', ['ja-JP'])).toBe('en')
    expect(resolveLang('system', [])).toBe('en')
  })
})

describe('messages', () => {
  const m = defineMessages({
    zh: { title: '设置', count: (n: number) => `${n} 个文件` },
    en: { title: 'Settings', count: (n: number) => `${n} files` }
  })

  it('picks the current language', () => {
    expect(pick(m).title).toBe('设置')
    setLang('en')
    expect(pick(m).count(3)).toBe('3 files')
  })

  it('withLang builds text in another language and restores the current one', () => {
    expect(withLang('en', () => pick(m).title)).toBe('Settings')
    expect(getLang()).toBe('zh')
    expect(() => withLang('en', () => { throw new Error('x') })).toThrow()
    expect(getLang()).toBe('zh')
  })

  it('notifies only on a change', () => {
    const seen: string[] = []
    const off = onLangChange((lang) => seen.push(lang))
    setLang('zh')
    setLang('en')
    off()
    setLang('zh')
    expect(seen).toEqual(['en'])
  })
})

describe('localized', () => {
  const LABEL = localized(defineMessages({ zh: { running: '运行中', idle: '空闲' }, en: { running: 'Running', idle: 'Idle' } }))

  it('reads the current language on every access, as a plain record would', () => {
    expect(LABEL.running).toBe('运行中')
    setLang('en')
    expect(LABEL.idle).toBe('Idle')
    expect(Object.entries(LABEL)).toEqual([['running', 'Running'], ['idle', 'Idle']])
    expect({ ...LABEL }).toEqual({ running: 'Running', idle: 'Idle' })
    expect('idle' in LABEL).toBe(true)
  })
})
