// The site cannot import src/shared/agent-icon-svg.ts (Vercel builds with site/ as its root), so agent-marks.ts is a
// copy of it. This reads both files as text and fails when a copied mark differs or a mark is missing, so a change on
// the desktop side (or a new CLI) cannot leave the website showing an old mark. Skipped when the repo file is not here.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const repoFile = new URL('../../src/shared/agent-icon-svg.ts', import.meta.url)
const copiedFile = new URL('./agent-marks.ts', import.meta.url)

/** The `id: '<svg …>'` rows of an icon table, in source order. */
const marks = (file: URL): Map<string, string> =>
  new Map([...readFileSync(file, 'utf8').matchAll(/^ {2}(\w+): '(<svg.*?)',?$/gm)].map((m) => [m[1], m[2]]))

test('the copied agent marks match src/shared/agent-icon-svg.ts', (t) => {
  if (!existsSync(repoFile)) {
    t.skip('src/shared/agent-icon-svg.ts is not in this checkout')
    return
  }
  const source = marks(repoFile)
  const copied = marks(copiedFile)
  assert.ok(source.size > 0 && copied.size > 0, 'no marks found to compare')
  for (const [id, mark] of copied) {
    assert.equal(mark, source.get(id), `${id} differs from src/shared/agent-icon-svg.ts; copy it again`)
  }
  assert.deepEqual([...copied.keys()].sort(), [...source.keys()].sort(), 'a mark in the source is not copied')
})
