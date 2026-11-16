// Run with `npm test` (node --test; Node strips the types).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextPage, project, rubber, settled, step } from './book-motion.ts'

test('the spring reaches the page without passing it', () => {
  let pos = 2
  let vel = 0
  let max = 0
  for (let k = 0; k < 120 && !settled(pos, vel, 3); k++) {
    ;[pos, vel] = step(pos, vel, 3, 1 / 60, 0.62)
    max = Math.max(max, pos)
  }
  assert.ok(settled(pos, vel, 3), `settled at ${pos}`)
  assert.ok(max <= 3 + 1e-3, `overshot to ${max}`)
})

test('a fast flick keeps its speed into the spring', () => {
  const [, still] = step(2.5, 0, 3, 1 / 60, 0.62)
  const [, flicked] = step(2.5, 4, 3, 1 / 60, 0.62)
  assert.ok(flicked > still)
})

test('past either end the page only lifts a little, and more pull lifts it more', () => {
  assert.equal(rubber(1.5, 11), 1.5)
  const a = rubber(-0.2, 11)
  const b = rubber(-2, 11)
  assert.ok(a < 0 && a > -0.14)
  assert.ok(b < a && b > -0.14)
  assert.ok(rubber(13, 11) > 11 && rubber(13, 11) < 11.14)
})

test('a drag lands one page on in the direction it was moving, never two', () => {
  assert.equal(project(3.2, 1.2, 3), 4)
  assert.equal(project(3.2, -1.2, 3), 2)
  assert.equal(project(3.9, 30, 3), 4)
  assert.equal(project(3.2, 0, 3), 3)
  assert.equal(project(3.7, 0.1, 3), 4)
  assert.equal(project(3.4, 2, 3.4), 4)
  assert.equal(project(3.4, -2, 3.4), 3)
})

test('a wheel gesture turns to the neighbouring page, also from mid-turn', () => {
  assert.equal(nextPage(3, 1), 4)
  assert.equal(nextPage(3, -1), 2)
  assert.equal(nextPage(3.4, 1), 4)
  assert.equal(nextPage(3.4, -1), 3)
})
