import { describe, expect, it } from 'vitest'
import type { GuiBranch } from '@shared/gui-chat'
import type { ChatItem } from '@shared/transcript-chat'
import { branchedChat } from './branches'

const user = (id: string, text: string): ChatItem => ({ kind: 'user', id, at: 0, text, images: 0 })
const reply = (id: string, text: string): ChatItem => ({ kind: 'text', id, at: 0, text })

const items = [user('u1', 'first'), reply('r1', 'one'), user('u3', 'cookie, refresh too'), reply('r3', 'both done')]
const branches: GuiBranch[] = [{ messageId: 'u3', older: [[user('u2', 'cookie'), reply('r2', 'login done')]] }]

describe('branchedChat', () => {
  it('draws the current branch with a 2 / 2 switch under the edited message', () => {
    const chat = branchedChat(items, branches, new Map())
    expect(chat.items).toBe(items)
    expect(chat.switches.get('u3')).toEqual({ messageId: 'u3', index: 1, count: 2 })
    expect(chat.readOnlyFrom).toBeNull()
  })

  it('draws an earlier version in place of the message and what followed it, read-only', () => {
    const chat = branchedChat(items, branches, new Map([['u3', 0]]))
    expect(chat.items.map((i) => i.id)).toEqual(['u1', 'r1', 'u2', 'r2'])
    expect(chat.switches.get('u2')).toEqual({ messageId: 'u3', index: 0, count: 2 })
    expect(chat.readOnlyFrom).toBe(2)
  })
})
