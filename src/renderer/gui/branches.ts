// Figma 90G′: an edited message's versions, ‹ 1 / 2 ›. The chat is the current branch; choosing an earlier version
// of a message draws that version (its prompt and what came under it) in place of the message and everything after
// it, read-only. Pure.
import type { GuiBranch } from '@shared/gui-chat'
import type { ChatItem } from '@shared/transcript-chat'

export interface BranchSwitch {
  /** The message on the current branch the versions belong to. */
  messageId: string
  /** 0-based; the current version is the last. */
  index: number
  count: number
}

export interface BranchedChat {
  items: readonly ChatItem[]
  /** By prompt id: the switch drawn under that message. */
  switches: ReadonlyMap<string, BranchSwitch>
  /** Items from this index on are an earlier version's: nothing in them can be edited or rewound. */
  readOnlyFrom: number | null
}

/** `viewing`: the version chosen per message (absent = the current one). The first message viewed earlier wins. */
export function branchedChat(items: readonly ChatItem[], branches: readonly GuiBranch[], viewing: ReadonlyMap<string, number>): BranchedChat {
  const byId = new Map(branches.map((b) => [b.messageId, b]))
  const switches = new Map<string, BranchSwitch>()
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    const branch = item.kind === 'user' ? byId.get(item.id) : undefined
    if (!branch) continue
    const count = branch.older.length + 1
    const index = Math.min(Math.max(viewing.get(item.id) ?? count - 1, 0), count - 1)
    const at: BranchSwitch = { messageId: item.id, index, count }
    if (index === count - 1) {
      switches.set(item.id, at)
      continue
    }
    const version = branch.older[index]!
    const prompt = version.find((v) => v.kind === 'user')
    if (prompt) switches.set(prompt.id, at)
    return { items: [...items.slice(0, i), ...version], switches, readOnlyFrom: i }
  }
  return { items, switches, readOnlyFrom: null }
}
