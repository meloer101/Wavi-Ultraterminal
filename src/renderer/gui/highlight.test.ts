import { describe, expect, it } from 'vitest'
import { highlightLines, languageOfPath, MAX_HIGHLIGHT_CHARS } from './highlight'

describe('highlightLines', () => {
  it('splits a highlighted block into lines of classed tokens', () => {
    const lines = highlightLines("const a = 'x'\nreturn a", 'ts')!
    expect(lines).toHaveLength(2)
    expect(lines[0]!.map((t) => t.text).join('')).toBe("const a = 'x'")
    expect(lines[0]!.find((t) => t.text === 'const')?.kind).toBe('keyword')
    expect(lines[0]!.find((t) => t.text === "'x'")?.kind).toBe('string')
    expect(lines[1]!.map((t) => t.text).join('')).toBe('return a')
  })

  it('keeps a token that spans lines on each of them (a block comment)', () => {
    const lines = highlightLines('/* a\nb */ x', 'js')!
    expect(lines[0]).toEqual([{ text: '/* a', kind: 'comment' }])
    expect(lines[1]![0]).toEqual({ text: 'b */', kind: 'comment' })
  })

  it('gives up on an unknown language or a huge block', () => {
    expect(highlightLines('x', 'no-such-language')).toBeNull()
    expect(highlightLines('a'.repeat(MAX_HIGHLIGHT_CHARS + 1), 'ts')).toBeNull()
  })
})

describe('languageOfPath', () => {
  it('reads the language from the extension or the file name', () => {
    expect(languageOfPath('server/auth/refresh.ts')).toBe('typescript')
    expect(languageOfPath('a/b.PY')).toBe('python')
    expect(languageOfPath('Makefile')).toBe('makefile')
    expect(languageOfPath('notes.unknownext')).toBeUndefined()
  })
})
