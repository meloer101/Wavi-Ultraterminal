import { describe, expect, it } from 'vitest'
import { basePath, visibleHole } from './glass-base'

const card = { left: 264, top: 6, right: 994, bottom: 894 }

describe('visibleHole', () => {
  it('keeps the whole card with its radius at every corner when nothing clips it', () => {
    expect(visibleHole(card, 10, [])).toEqual({ ...card, radii: [10, 10, 10, 10] })
  })

  it('cuts a card a drawer clips straight on that side only', () => {
    // The right panel's card mid-opening: the aside shows its right 200px.
    const hole = visibleHole({ left: 1000, top: 6, right: 1480, bottom: 894 }, 10, [{ left: 1280, top: 0, right: 1486, bottom: 900 }])
    expect(hole).toEqual({ left: 1280, top: 6, right: 1480, bottom: 894, radii: [0, 10, 10, 0] })
  })

  it('is null when the card is clipped away or has no size', () => {
    expect(visibleHole(card, 10, [{ left: 0, top: 0, right: 200, bottom: 900 }])).toBeNull()
    expect(visibleHole({ left: 10, top: 10, right: 10, bottom: 80 }, 10, [])).toBeNull()
  })

  it('never rounds more than half the visible side', () => {
    expect(visibleHole({ left: 0, top: 0, right: 12, bottom: 100 }, 10, [])?.radii).toEqual([6, 6, 6, 6])
  })
})

describe('basePath', () => {
  it('is the whole layer when no card shows', () => {
    expect(basePath(1440, 900, [])).toBe('path(evenodd, "M0 0H1440V900H0Z")')
  })

  it('cuts one rounded subpath per card', () => {
    const hole = visibleHole({ left: 264, top: 6, right: 994.5, bottom: 894 }, 10, [])!
    expect(basePath(1440, 900, [hole])).toBe(
      'path(evenodd, "M0 0H1440V900H0Z' +
        'M274 6H984.5A10 10 0 0 1 994.5 16V884A10 10 0 0 1 984.5 894H274A10 10 0 0 1 264 884V16A10 10 0 0 1 274 6Z")'
    )
  })

  it('draws a clipped side without arcs', () => {
    const hole = visibleHole({ left: 1000, top: 6, right: 1480, bottom: 894 }, 10, [{ left: 1280, top: 0, right: 1486, bottom: 900 }])!
    expect(basePath(1486, 900, [hole])).toBe(
      'path(evenodd, "M0 0H1486V900H0ZM1280 6H1470A10 10 0 0 1 1480 16V884A10 10 0 0 1 1470 894H1280V6Z")'
    )
  })
})
