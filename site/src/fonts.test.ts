// The font files are subsets of only the characters in src/i18n.ts. This checks each character the copy uses is in
// the face that draws it, so new copy cannot silently fall back to a system font. Run with `npm test`.
// To re-make a subset, fetch https://fonts.googleapis.com/css2?family=<Family>:<axes>&text=<characters> with a
// browser User-Agent and download the woff2 it links (DM Sans wght@400;500;600, JetBrains Mono wght@400,
// Source Serif 4 ital,wght@1,400 with only the emphasised headline word `ALL`, Noto Sans SC wght@400;500, Noto
// Serif SC wght@500 with only the Chinese emphasised word `所有`); DM Sans and Noto Sans SC come back as one variable
// file spanning their weights, the other three as one file each.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { brotliDecompressSync } from 'node:zlib'

const fontsDir = new URL('./assets/fonts/', import.meta.url)
const copy = readFileSync(new URL('./i18n.ts', import.meta.url), 'utf8')

/** Code points a WOFF2 file maps to glyphs, read from its cmap table (formats 4 and 12). */
function codePoints(file: string): Set<number> {
  const buf = readFileSync(new URL(file, fontsDir))
  assert.equal(buf.toString('latin1', 0, 4), 'wOF2', `${file} is not WOFF2`)
  const numTables = buf.readUInt16BE(12)
  const compressed = buf.readUInt32BE(20)
  let at = 48
  const base128 = (): number => {
    let v = 0
    for (let i = 0; i < 5; i++) {
      const b = buf[at++]
      v = v * 128 + (b & 0x7f)
      if (!(b & 0x80)) return v
    }
    throw new Error('bad UIntBase128')
  }
  const tables: { tag: number; length: number }[] = []
  for (let i = 0; i < numTables; i++) {
    const flags = buf[at++]
    const tag = flags & 0x3f
    if (tag === 63) at += 4
    const version = flags >> 6
    const orig = base128()
    // glyf (10) and loca (11) are transformed unless version 3; every other table only when version is not 0.
    const transformed = tag === 10 || tag === 11 ? version !== 3 : version !== 0
    tables.push({ tag, length: transformed ? base128() : orig })
  }
  const data = brotliDecompressSync(buf.subarray(at, at + compressed))
  let offset = 0
  let cmap: Buffer | null = null
  for (const t of tables) {
    if (t.tag === 0) cmap = data.subarray(offset, offset + t.length)
    offset += t.length
  }
  assert.ok(cmap, `${file} has no cmap`)
  const out = new Set<number>()
  const n = cmap.readUInt16BE(2)
  for (let i = 0; i < n; i++) {
    const sub = cmap.readUInt32BE(4 + i * 8 + 4)
    const format = cmap.readUInt16BE(sub)
    if (format === 12) {
      const groups = cmap.readUInt32BE(sub + 12)
      for (let g = 0; g < groups; g++) {
        const start = cmap.readUInt32BE(sub + 16 + g * 12)
        const end = cmap.readUInt32BE(sub + 20 + g * 12)
        for (let c = start; c <= end; c++) out.add(c)
      }
    } else if (format === 4) {
      const segs = cmap.readUInt16BE(sub + 6) / 2
      for (let s = 0; s < segs; s++) {
        const end = cmap.readUInt16BE(sub + 14 + s * 2)
        const start = cmap.readUInt16BE(sub + 16 + segs * 2 + s * 2)
        for (let c = start; c <= end && c !== 0xffff; c++) out.add(c)
      }
    }
  }
  return out
}

const used = (pattern: RegExp): string[] => [...new Set([...copy].filter((c) => pattern.test(c)))]
const missing = (file: string, chars: string[]): string => {
  const have = codePoints(file)
  return chars.filter((c) => !have.has(c.codePointAt(0) ?? 0)).join('')
}

// Latin text, punctuation and the typographic marks the copy uses; ⌘ ⇧ ↵ are left to the system font on purpose.
const latin = used(/[!-~’‘“”–—·º…©›→]/u)
// Chinese characters and full-width punctuation.
const cjk = used(/[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/u)

test('the copy has characters to check', () => {
  assert.ok(latin.length > 60 && cjk.length > 200)
})

for (const file of ['dm-sans-wght-subset.woff2', 'jetbrains-mono-subset.woff2']) {
  test(`${file} holds every Latin character of the copy`, () => {
    assert.equal(missing(file, latin), '', 'Re-make the subset (see the top of this file).')
  })
}

test('noto-sans-sc-subset.woff2 holds every Chinese character of the copy', () => {
  assert.equal(missing('noto-sans-sc-subset.woff2', cjk), '', 'Re-make the subset (see the top of this file).')
})

test('the serif italics hold the two emphasised headline words', () => {
  assert.equal(missing('source-serif-4-italic-subset.woff2', [...'ALL']), '', 'Re-make the ALL subset.')
  assert.equal(missing('noto-serif-sc-subset.woff2', [...'所有']), '', 'Re-make the 所有 subset.')
})
