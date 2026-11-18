import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

// resources/hooks/wavi-pi-gate.js: a Pi terminal's 询问 / 接受编辑 (PRD F24 v1.205), the only thing that asks there.
type Block = { block: true; reason: string } | undefined
type Ctx = { hasUI: boolean; ui: { confirm: (title: string, detail: string) => Promise<boolean> } }
type Decide = (level: string | undefined, event: { toolName: string; input?: unknown }, ctx: Ctx) => Promise<Block>

const gate = (): Promise<{ decide: Decide }> => import(pathToFileURL(join(__dirname, '../../../resources/hooks/wavi-pi-gate.js')).href) as Promise<{ decide: Decide }>
const asking = (answer: boolean, asked: string[] = []): Ctx => ({
  hasUI: true,
  ui: { confirm: (title, detail) => (asked.push(`${title} ${detail}`), Promise.resolve(answer)) }
})

describe('wavi-pi-gate', () => {
  it('询问 asks before every call that is not read-only, with the command; a no blocks it', async () => {
    const { decide } = await gate()
    const asked: string[] = []
    expect(await decide('ask', { toolName: 'read', input: { path: 'a' } }, asking(false, asked))).toBeUndefined()
    expect(await decide('ask', { toolName: 'bash', input: { command: 'rm -rf build' } }, asking(true, asked))).toBeUndefined()
    expect(await decide('ask', { toolName: 'edit', input: { path: 'a' } }, asking(false, asked))).toMatchObject({ block: true })
    expect(asked).toEqual(['Allow bash? rm -rf build', 'Allow edit? {"path":"a"}'])
  })

  it('接受编辑 lets file changes through and still asks for commands', async () => {
    const { decide } = await gate()
    expect(await decide('accept-edits', { toolName: 'write', input: {} }, asking(false))).toBeUndefined()
    expect(await decide('accept-edits', { toolName: 'bash', input: { command: 'ls' } }, asking(false))).toMatchObject({ block: true })
  })

  it('blocks when there is no one to ask, and asks nothing at any other level', async () => {
    const { decide } = await gate()
    expect(await decide('ask', { toolName: 'bash', input: {} }, { ...asking(true), hasUI: false })).toMatchObject({ block: true })
    expect(await decide(undefined, { toolName: 'bash', input: {} }, asking(false))).toBeUndefined()
    expect(await decide('full-access', { toolName: 'bash', input: {} }, asking(false))).toBeUndefined()
  })
})
