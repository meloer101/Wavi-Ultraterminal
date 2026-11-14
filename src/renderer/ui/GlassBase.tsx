import { useLayoutEffect, useRef } from 'react'
import styles from './GlassBase.module.css'
import { basePath, visibleHole, withoutOverlaps, type Box, type Hole } from './glass-base'

/** Transitions that move or resize a card; colour and opacity ones (hover) do not. */
const GEOMETRY = /^(width|height|min-width|max-width|padding|margin|inset|left|right|top|bottom|flex|transform|translate|scale)/

const NONE: readonly string[] = []

/**
 * The window's base layer: the shown session's shell tint (AppShell's --tr-sidebar-bg) over its parent's whole box, cut
 * out at each [data-glass-card] inside that parent (PRD v1.183, Figma 84A). A nested GlassBase (the 外观 preview in the
 * settings sheet) owns the cards inside its own parent. `watch` names the attributes, anywhere in the parent, whose
 * changes move or show cards without resizing them (a drawer's phase, the overview's data-hidden).
 */
export function GlassBase({ watch = NONE }: { watch?: readonly string[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const base = ref.current
    if (base) return trackCards(base, watch)
  }, [watch])
  return <div ref={ref} className={styles.base} data-glass-base="" aria-hidden />
}

function trackCards(base: HTMLElement, watch: readonly string[]): () => void {
  const scope = base.parentElement
  if (!scope) return () => {}
  scope.setAttribute('data-glass-scope', '')
  // How long a drawer moves (tokens.css).
  const motionMs = parseFloat(getComputedStyle(scope).getPropertyValue('--motion-duration-drawer')) || 500
  let frame = 0
  // A drawer in motion moves its card without resizing it: measure each frame until then.
  let movingUntil = 0
  let last = ''

  const ownCards = (): HTMLElement[] =>
    [...scope.querySelectorAll<HTMLElement>('[data-glass-card]')].filter((card) => card.closest('[data-glass-scope]') === scope)

  const measure = (): void => {
    const origin = base.getBoundingClientRect()
    // Hidden (full screen draws no base layer): nothing to cut until it shows again, which resizes it.
    if (origin.width === 0 || origin.height === 0) return
    const box = (r: DOMRect): Box => ({ left: r.left - origin.left, top: r.top - origin.top, right: r.right - origin.left, bottom: r.bottom - origin.top })
    const holes: Hole[] = []
    for (const card of ownCards()) {
      const rect = card.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const clips: Box[] = []
      for (let el = card.parentElement; el && el !== scope; el = el.parentElement) {
        if (getComputedStyle(el).overflow !== 'visible') clips.push(box(el.getBoundingClientRect()))
      }
      const hole = visibleHole(box(rect), parseFloat(getComputedStyle(card).borderTopLeftRadius) || 0, clips)
      if (hole) holes.push(hole)
    }
    const cut = withoutOverlaps(holes)
    const path = basePath(origin.width, origin.height, cut)
    if (path !== last) {
      last = path
      base.style.clipPath = path
      base.dataset.holes = String(cut.length)
    }
  }

  const tick = (): void => {
    frame = 0
    measure()
    if (performance.now() < movingUntil) frame = requestAnimationFrame(tick)
  }

  // A resize is measured in the same frame (the observer runs after layout, before paint), so a hole never trails its
  // card while the window, a divider or a drawer's width moves.
  const resizes = new ResizeObserver(measure)
  const observeCards = (): void => {
    resizes.disconnect()
    resizes.observe(scope)
    resizes.observe(base)
    for (const card of ownCards()) resizes.observe(card)
  }
  // Cards come and go (a split pane, the overview, the right panel). Terminal output and chat turns add nodes all the
  // time; only a change that adds or drops a card, or a watched attribute, counts.
  const hasCard = (node: Node): boolean => node instanceof Element && (node.matches('[data-glass-card]') || node.querySelector('[data-glass-card]') !== null)
  const mutations = new MutationObserver((records) => {
    if (!records.some((r) => r.type === 'attributes' || [...r.addedNodes].some(hasCard) || [...r.removedNodes].some(hasCard))) return
    observeCards()
    measure()
  })
  mutations.observe(scope, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-glass-card', ...watch] })

  // Only a transition on a card or on something holding one moves a card; a pressed button's transform does not.
  const movesCards = (e: TransitionEvent): boolean => GEOMETRY.test(e.propertyName) && e.target instanceof Element && hasCard(e.target)
  const onMotion = (e: TransitionEvent): void => {
    if (!movesCards(e)) return
    movingUntil = Math.max(movingUntil, performance.now() + motionMs + 50)
    if (!frame) frame = requestAnimationFrame(tick)
  }
  const onSettle = (e: TransitionEvent): void => {
    if (movesCards(e)) measure()
  }
  scope.addEventListener('transitionrun', onMotion)
  scope.addEventListener('transitionend', onSettle)
  scope.addEventListener('transitioncancel', onSettle)

  observeCards()
  measure()
  return () => {
    cancelAnimationFrame(frame)
    resizes.disconnect()
    mutations.disconnect()
    scope.removeEventListener('transitionrun', onMotion)
    scope.removeEventListener('transitionend', onSettle)
    scope.removeEventListener('transitioncancel', onSettle)
    scope.removeAttribute('data-glass-scope')
  }
}
