import { useLayoutEffect, useRef } from 'react'
import styles from './GlassBase.module.css'
import { basePath, visibleHole, type Box, type Hole } from './glass-base'

/** Transitions that move or resize a card; colour and opacity ones (hover) do not. */
const GEOMETRY = /^(width|height|min-width|max-width|padding|margin|inset|left|right|top|bottom|flex|transform|translate|scale)/

/**
 * The window's base layer: the shown session's shell tint (AppShell's --tr-sidebar-bg) over its parent's whole box, cut
 * out at each [data-glass-card] inside that parent. A nested GlassBase (the 外观 preview in the settings sheet) owns
 * the cards inside its own parent.
 */
export function GlassBase() {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const base = ref.current
    if (base) return trackCards(base)
  }, [])
  return <div ref={ref} className={styles.base} data-glass-base="" aria-hidden />
}

function trackCards(base: HTMLElement): () => void {
  const scope = base.parentElement
  if (!scope) return () => {}
  scope.setAttribute('data-glass-scope', '')
  // How long a drawer moves (tokens.css; app-shell/drawer-motion keeps DRAWER_MS in step with it).
  const motionMs = parseFloat(getComputedStyle(scope).getPropertyValue('--motion-duration-drawer')) || 500
  let frame = 0
  // A drawer or a divider in motion moves cards without resizing them every frame: measure each frame until then.
  let movingUntil = 0
  let last = ''

  const ownCards = (): HTMLElement[] =>
    [...scope.querySelectorAll<HTMLElement>('[data-glass-card]')].filter((card) => card.closest('[data-glass-scope]') === scope)

  const measure = (): void => {
    const origin = base.getBoundingClientRect()
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
    const path = basePath(origin.width, origin.height, holes)
    if (path !== last) {
      last = path
      base.style.clipPath = path
    }
  }

  const tick = (): void => {
    frame = 0
    measure()
    if (performance.now() < movingUntil) schedule()
  }
  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(tick)
  }

  const resizes = new ResizeObserver(schedule)
  const observeCards = (): void => {
    resizes.disconnect()
    resizes.observe(scope)
    for (const card of ownCards()) resizes.observe(card)
  }
  // Cards come and go (a split pane, the overview, the right panel) and drawers change phase. Terminal output and chat
  // turns add nodes all the time; only a change that adds or drops a card counts.
  const hasCard = (node: Node): boolean => node instanceof Element && (node.matches('[data-glass-card]') || node.querySelector('[data-glass-card]') !== null)
  const mutations = new MutationObserver((records) => {
    if (!records.some((r) => r.type === 'attributes' || [...r.addedNodes].some(hasCard) || [...r.removedNodes].some(hasCard))) return
    observeCards()
    schedule()
  })
  mutations.observe(scope, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-glass-card', 'data-phase', 'data-hidden', 'data-mode', 'data-sidebar'] })

  const onMotion = (e: TransitionEvent): void => {
    if (!GEOMETRY.test(e.propertyName)) return
    movingUntil = Math.max(movingUntil, performance.now() + motionMs + 50)
    schedule()
  }
  const onSettle = (e: TransitionEvent): void => {
    if (GEOMETRY.test(e.propertyName)) schedule()
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
