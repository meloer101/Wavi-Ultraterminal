import { describe, expect, it } from 'vitest'
import { forgetTyping, lastSubmitIn, noteInput, noteInserted, onUserSubmit, typingIn } from './typing'

describe('typing (PRD F21: Wavi types a report in only while nobody types there)', () => {
  it('counts keys, and a draft until Enter, Ctrl+C or Ctrl+U', () => {
    forgetTyping('a')
    expect(typingIn('a')).toEqual({ lastKeyAt: null, draft: false })
    noteInput('a', 'fix th', 1_000)
    expect(typingIn('a')).toEqual({ lastKeyAt: 1_000, draft: true })
    noteInput('a', '\x1b[D', 2_000)
    expect(typingIn('a')).toEqual({ lastKeyAt: 2_000, draft: true })
    noteInput('a', 'e bug\r', 3_000)
    expect(typingIn('a').draft).toBe(false)
    noteInput('a', 'half', 4_000)
    noteInput('a', '\x03', 5_000)
    expect(typingIn('a').draft).toBe(false)
  })

  it('keeps a draft over Option+Enter and \\+Enter newlines, and over text Wavi inserted', () => {
    forgetTyping('c')
    noteInput('c', 'line one', 1_000)
    noteInput('c', '\x1b\r', 1_100)
    expect(typingIn('c').draft).toBe(true)
    noteInput('c', '\\', 1_200)
    noteInput('c', '\r', 1_300)
    expect(typingIn('c').draft).toBe(true)
    noteInput('c', '\r', 1_400)
    expect(typingIn('c').draft).toBe(false)
    noteInserted('c', 2_000)
    expect(typingIn('c')).toEqual({ lastKeyAt: 2_000, draft: true })
  })

  it('ignores mouse and focus reports', () => {
    forgetTyping('b')
    noteInput('b', '\x1b[<64;10;5M\x1b[<65;10;5M', 1_000)
    noteInput('b', '\x1b[I', 1_000)
    expect(typingIn('b')).toEqual({ lastKeyAt: null, draft: false })
  })
})

describe('a line the user sent (PRD F21 v1.198: a leader’s tell is answered, its turn is the user’s)', () => {
  it('counts Enter after text, typed before or in the same chunk; not a bare Enter, nor a newline', () => {
    forgetTyping('l')
    const sent: string[] = []
    const off = onUserSubmit((id) => sent.push(id))
    try {
      noteInput('l', '\r', 1_000)
      noteInput('l', '\x1b[B\r', 1_100)
      expect(lastSubmitIn('l')).toBeNull()
      noteInput('l', 'go on', 2_000)
      noteInput('l', '\x1b\r', 2_100)
      expect(sent).toEqual([])
      noteInput('l', '\r', 3_000)
      expect(lastSubmitIn('l')).toBe(3_000)
      noteInput('l', 'yes\r', 4_000)
      expect(lastSubmitIn('l')).toBe(4_000)
      expect(sent).toEqual(['l', 'l'])
    } finally {
      off()
    }
    noteInput('l', 'again\r', 5_000)
    expect(sent).toHaveLength(2)
  })
})
