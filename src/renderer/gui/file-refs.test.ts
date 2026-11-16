import { describe, expect, it } from 'vitest'
import { codeRef, hrefRef, outputRuns, refPieces } from './file-refs'

describe('codeRef', () => {
  it('reads a path with its line from inline code', () => {
    expect(codeRef('server/auth/refresh.ts:42')).toEqual({ path: 'server/auth/refresh.ts', line: 42, column: null })
    expect(codeRef('src/a.ts#L7')).toEqual({ path: 'src/a.ts', line: 7, column: null })
  })

  it('leaves code that is not only a path', () => {
    expect(codeRef('readToken()')).toBeNull()
    expect(codeRef('pnpm vitest run server/auth')).toBeNull()
  })
})

describe('hrefRef', () => {
  it('reads a link to a file, not a URL', () => {
    expect(hrefRef('src/a.ts#L42')).toEqual({ path: 'src/a.ts', line: 42, column: null })
    expect(hrefRef('src/%E8%AF%B4%E6%98%8E.md')).toEqual({ path: 'src/说明.md', line: null, column: null })
    expect(hrefRef('https://example.com/a.ts')).toBeNull()
    expect(hrefRef('file:///Users/x/a.ts')).toBeNull()
    expect(hrefRef('#section')).toBeNull()
  })
})

describe('refPieces', () => {
  it('splits prose around paths, keeping the text whole', () => {
    const text = '改在 server/auth/refresh.ts:42 里，\n还有 src/lib/session.ts。'
    const pieces = refPieces(text)
    expect(pieces.map((p) => (typeof p === 'string' ? p : p.text)).join('')).toBe(text)
    expect(pieces.filter((p) => typeof p !== 'string').map((p) => (typeof p === 'string' ? null : p.target))).toEqual([
      { path: 'server/auth/refresh.ts', line: 42, column: null },
      { path: 'src/lib/session.ts', line: null, column: null }
    ])
  })

  it('takes a path out of CJK prose glued to it', () => {
    const pieces = refPieces('修改了src/app.ts中的函数')
    expect(pieces).toEqual(['修改了', { text: 'src/app.ts', target: { path: 'src/app.ts', line: null, column: null } }, '中的函数'])
  })

  it('reads a stack frame location', () => {
    const pieces = refPieces('    at refresh (server/auth/refresh.ts:42:17)')
    expect(pieces[1]).toEqual({ text: 'server/auth/refresh.ts:42:17', target: { path: 'server/auth/refresh.ts', line: 42, column: 17 } })
  })
})

describe('outputRuns', () => {
  it('folds two or more dependency frames in a row', () => {
    const raw = [
      'TypeError: x',
      '    at readToken (server/legacy/storage.ts:12:23)',
      '    at a (/repo/node_modules/h3/dist/index.mjs:1:2)',
      '    at b (/repo/node_modules/h3/dist/index.mjs:3:4)',
      '    at c (server/routes/auth.ts:23:5)',
      '    at d (/repo/node_modules/x/y.js:1:1)'
    ].join('\n')
    expect(outputRuns(raw)).toEqual([
      { kind: 'text', text: 'TypeError: x\n    at readToken (server/legacy/storage.ts:12:23)' },
      { kind: 'frames', count: 2, text: '    at a (/repo/node_modules/h3/dist/index.mjs:1:2)\n    at b (/repo/node_modules/h3/dist/index.mjs:3:4)' },
      { kind: 'text', text: '    at c (server/routes/auth.ts:23:5)\n    at d (/repo/node_modules/x/y.js:1:1)' }
    ])
  })
})
