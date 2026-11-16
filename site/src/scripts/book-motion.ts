/* The arithmetic behind turning a page (scripts/book.ts): a critically damped spring, soft ends, and where a
   gesture lands. Positions are in pages: 3 is page 3 at rest, 3.4 is 40% of the way to page 4. */

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** One frame of a critically damped spring (no overshoot) toward `target`; `response` is roughly its period, in seconds. */
export function step(pos: number, vel: number, target: number, dt: number, response: number): [number, number] {
  const w = (2 * Math.PI) / response
  const h = dt / 4
  for (let k = 0; k < 4; k++) {
    vel += (-w * w * (pos - target) - 2 * w * vel) * h
    pos += vel * h
  }
  return [pos, vel]
}

export const settled = (pos: number, vel: number, target: number): boolean => Math.abs(pos - target) < 1e-4 && Math.abs(vel) < 1e-3

/** Past the first or last page the leaf only lifts a little, more slowly the further it is pulled. */
export function rubber(p: number, last: number): number {
  const soft = (o: number): number => 0.14 * (1 - 1 / (1 + (o / 0.14) * 0.55))
  if (p < 0) return -soft(-p)
  if (p > last) return last + soft(p - last)
  return p
}

/** The page next to `base` in direction `dir`; from mid-turn that is the page being turned to or back to. */
export const nextPage = (base: number, dir: number): number => (dir > 0 ? Math.floor(base + 1e-6) + 1 : Math.ceil(base - 1e-6) - 1)

/** Where a drag that started at `base` lands: decided by the release speed (pages/s) when there is one, else by
    the nearest page; never more than one page from where it started. */
export function project(pos: number, vel: number, base: number): number {
  const lo = nextPage(base, -1)
  const hi = nextPage(base, 1)
  if (Math.abs(vel) > 0.5) return vel > 0 ? hi : lo
  return clamp(Math.round(pos), lo, hi)
}
