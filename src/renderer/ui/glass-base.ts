// The window's base layer (PRD v1.183, Figma 84A): one tint over the whole window — the sidebar, the gaps between the
// cards and the margins round them — with a hole where each card is, so a card sits on the bare glass at its own
// opacity instead of stacking on the tint. Pure geometry here; GlassBase.tsx (same folder) measures the cards and applies the path.

/** A rectangle in the base layer's own coordinates (px from its top-left corner). */
export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** A card's visible rectangle and its corner radii: top-left, top-right, bottom-right, bottom-left. */
export interface Hole extends Box {
  radii: readonly [number, number, number, number]
}

/**
 * The part of a card left inside every box that clips it (a drawer mid-motion, a scroller), or null when nothing of it
 * shows. A corner keeps the card's radius only where both of its edges are the card's own: an edge a clip cuts is
 * straight, as the card looks there.
 */
export function visibleHole(card: Box, radius: number, clips: readonly Box[]): Hole | null {
  let { left, top, right, bottom } = card
  for (const c of clips) {
    left = Math.max(left, c.left)
    top = Math.max(top, c.top)
    right = Math.min(right, c.right)
    bottom = Math.min(bottom, c.bottom)
  }
  if (right - left <= 0 || bottom - top <= 0) return null
  const r = Math.max(0, Math.min(radius, (right - left) / 2, (bottom - top) / 2))
  const own = { left: left === card.left, top: top === card.top, right: right === card.right, bottom: bottom === card.bottom }
  return {
    left,
    top,
    right,
    bottom,
    radii: [own.top && own.left ? r : 0, own.top && own.right ? r : 0, own.bottom && own.right ? r : 0, own.bottom && own.left ? r : 0]
  }
}

/**
 * The holes to cut, in DOM order, without a card that overlaps one already cut: such a card floats over the other (the
 * right panel as an overlay over the main card), and an even-odd path would tint the overlap again.
 */
export function withoutOverlaps(holes: readonly Hole[]): Hole[] {
  const kept: Hole[] = []
  for (const h of holes) {
    if (!kept.some((k) => h.left < k.right && k.left < h.right && h.top < k.bottom && k.top < h.bottom)) kept.push(h)
  }
  return kept
}

const n = (v: number): string => `${Math.round(v * 100) / 100}`

/** One hole as a closed subpath, clockwise from its top-left corner. */
function holePath({ left: l, top: t, right: r, bottom: b, radii: [tl, tr, br, bl] }: Hole): string {
  const arc = (radius: number, x: number, y: number): string => (radius > 0 ? `A${n(radius)} ${n(radius)} 0 0 1 ${n(x)} ${n(y)}` : '')
  return (
    `M${n(l + tl)} ${n(t)}H${n(r - tr)}${arc(tr, r, t + tr)}` +
    `V${n(b - br)}${arc(br, r - br, b)}` +
    `H${n(l + bl)}${arc(bl, l, b - bl)}` +
    `V${n(t + tl)}${arc(tl, l + tl, t)}Z`
  )
}

/**
 * The base layer's clip-path: its whole box with the holes cut out (even-odd, so a hole's own winding does not matter).
 * Width and height are the layer's size.
 */
export function basePath(width: number, height: number, holes: readonly Hole[]): string {
  const outer = `M0 0H${n(width)}V${n(height)}H0Z`
  return `path(evenodd, "${outer}${holes.map(holePath).join('')}")`
}
