// The order of the prompt list the phone gets (PRD F22): two builds overlap, they may resolve in the other order.
import { describe, expect, it } from 'vitest'
import { PromptPusher } from './prompt-push'

/** A build whose resolution the test decides. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('PromptPusher', () => {
  it('drops a build that started earlier and resolved later: the newest start is the one sent', async () => {
    const sent: string[][] = []
    const pusher = new PromptPusher<string[]>((value) => sent.push(value))
    const older = deferred<string[]>()
    const first = pusher.push(() => older.promise)
    const second = pusher.push(() => Promise.resolve(['asked']))
    await second
    // The desktop answers it while the older build (a "is it held" answer on its way) is still out.
    older.resolve(['answered'])
    await first
    expect(sent).toEqual([['asked']])
  })

  it('sends only what changed', async () => {
    const sent: string[][] = []
    const pusher = new PromptPusher<string[]>((value) => sent.push(value))
    await pusher.push(() => Promise.resolve([]))
    await pusher.push(() => Promise.resolve([]))
    await pusher.push(() => Promise.resolve(['asked']))
    await pusher.push(() => Promise.resolve(['asked']))
    await pusher.push(() => Promise.resolve([]))
    expect(sent).toEqual([[], ['asked'], []])
  })

  it('sends the same list again after a reset (a new phone, or a new server)', async () => {
    const sent: string[][] = []
    const pusher = new PromptPusher<string[]>((value) => sent.push(value))
    await pusher.push(() => Promise.resolve(['asked']))
    pusher.reset()
    await pusher.push(() => Promise.resolve(['asked']))
    expect(sent).toEqual([['asked'], ['asked']])
  })

  it('compares by the key it is given, not by the object', () => {
    const sent: { id: string }[] = []
    const pusher = new PromptPusher<{ id: string }>((value) => sent.push(value), (value) => value.id)
    void pusher.push(() => Promise.resolve({ id: 'a' }))
    return pusher.push(() => Promise.resolve({ id: 'a' })).then(() => expect(sent).toHaveLength(1))
  })
})
