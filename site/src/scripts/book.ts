/* Turns the magazine (components/Magazine.astro): spreads on wide screens, single pages on phones.
   One float, `pos`, says where the reader is (2.4 = 40% of the way from page 2 to page 3); a critically damped
   spring moves it, so any input can grab it mid-turn. Wheel, trackpad, touch drag and keys each turn one page.
   Spreads hinge at the gutter (the right half of one spread folds over onto the left half of the next); phone
   pages hinge at their left edge. With reduced motion the pages cross-fade instead. */
import { SPREAD_QUERY } from '../book-layout.ts'
import { clamp, nextPage, project, rubber, settled, step } from './book-motion.ts'

type Mode = 'spread' | 'single'

const root = document.documentElement
const board = document.querySelector<HTMLElement>('[data-board]')
const zoom = document.querySelector<HTMLDialogElement>('[data-zoom]')

// Base.astro drops .js when this script has not started within 4 s and the pages stay stacked; a late start leaves them so.
if (board && root.classList.contains('js')) start(board)

function start(board: HTMLElement): void {
  const spreads = [...board.querySelectorAll<HTMLElement>('[data-spread]')]
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')
  const wide = matchMedia(SPREAD_QUERY)

  // ---- what one turn moves: spreads, or pages on phones ----
  let mode: Mode = pickMode()
  let units: HTMLElement[] = []
  let unitSpread: number[] = []
  let pos = 0
  let vel = 0
  let target = 0
  let running = false
  let last = 0
  let frame = 0

  // the leaf (spreads only): clones of the two spreads being turned, cut to the halves that fold
  const front = face('face-front')
  const back = face('face-back')
  const underL = under('under-l')
  const underR = under('under-r')
  const clones = new Map<number, HTMLElement>()

  function pickMode(): Mode {
    return wide.matches ? 'spread' : 'single'
  }

  function face(cls: string): HTMLElement {
    const el = document.createElement('div')
    el.className = `face ${cls}`
    el.hidden = true
    el.setAttribute('aria-hidden', 'true')
    board.append(el)
    return el
  }
  function under(cls: string): HTMLElement {
    const el = document.createElement('div')
    el.className = `under ${cls}`
    el.setAttribute('aria-hidden', 'true')
    board.append(el)
    return el
  }

  function cloneOf(i: number): HTMLElement | null {
    if (i < 0 || i >= spreads.length) return null
    let c = clones.get(i)
    if (!c) {
      c = spreads[i].cloneNode(true) as HTMLElement
      c.removeAttribute('id')
      c.removeAttribute('style')
      c.removeAttribute('data-spread')
      c.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'))
      c.classList.add('is-near', 'is-on')
      c.inert = true
      clones.set(i, c)
    }
    return c
  }

  function setUnits(next: Mode): void {
    const spreadNow = unitSpread[Math.round(pos)] ?? 0
    for (const u of units) {
      u.classList.remove('unit', 'is-near', 'is-on')
      u.style.cssText = ''
    }
    mode = next
    clones.clear()
    root.classList.toggle('book-spread', mode === 'spread')
    root.classList.toggle('book-single', mode === 'single')
    units = []
    unitSpread = []
    spreads.forEach((s, i) => {
      const pages = [...s.querySelectorAll<HTMLElement>(':scope > .page')]
      const parts = mode === 'spread' || s.hasAttribute('data-merge') || pages.length < 2 ? [s] : pages
      for (const p of parts) {
        if (mode === 'single') {
          p.classList.add('unit')
        }
        units.push(p)
        unitSpread.push(i)
      }
    })
    pos = target = Math.max(0, unitSpread.indexOf(spreadNow))
    vel = 0
    front.hidden = back.hidden = true
    layout()
    render()
  }

  function layout(): void {
    if (mode === 'spread') {
      // offsetWidth / offsetHeight are the spread's size before the scale (site.css: 1440×900).
      board.style.setProperty('--scale', String(Math.min(innerWidth / board.offsetWidth, innerHeight / board.offsetHeight)))
      return
    }
    board.style.removeProperty('--scale')
    // A page taller than the screen (short phones) is shrunk to fit rather than scrolled.
    for (const u of units) {
      u.style.removeProperty('--fit')
      const near = u.classList.contains('is-near')
      if (!near) u.classList.add('is-near')
      const cs = getComputedStyle(u)
      const room = u.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      const kids = [...u.children].filter((k): k is HTMLElement => k instanceof HTMLElement && !k.classList.contains('folio'))
      let fit = 1
      for (let pass = 0; pass < 3 && kids.length; pass++) {
        const extent = kids[kids.length - 1].getBoundingClientRect().bottom - kids[0].getBoundingClientRect().top
        if (extent <= room + 1) break
        fit *= room / extent
        u.style.setProperty('--fit', fit.toFixed(3))
      }
      if (!near) u.classList.remove('is-near')
    }
  }

  // ---- drawing one position ----
  function render(): void {
    const i = Math.floor(pos)
    const f = pos - i
    units.forEach((u, k) => {
      const near = k >= i - 1 && k <= i + 2
      // Hidden pages never scroll into view, so their lazy images are fetched once they are a turn away.
      if (near && !u.classList.contains('is-near')) u.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach((img) => (img.loading = 'eager'))
      u.classList.toggle('is-near', near)
      u.classList.toggle('is-on', k === i || (f > 0 && k === i + 1))
      u.style.zIndex = ''
      u.style.opacity = ''
      u.style.transform = ''
      u.style.clipPath = ''
      u.style.removeProperty('--shade')
    })
    const cur = units[i]
    const next = units[i + 1]
    front.hidden = back.hidden = true
    underL.style.removeProperty('--shade')
    underR.style.removeProperty('--shade')
    if (f > 0 && reduce.matches) {
      if (next) {
        next.style.zIndex = '2'
        next.style.opacity = f.toFixed(3)
      }
    } else if (f > 0 && mode === 'single') {
      if (cur) {
        cur.style.zIndex = '2'
        cur.style.transform = `rotateY(${(-f * 180).toFixed(2)}deg)`
        cur.style.setProperty('--shade', (0.6 * Math.sin(f * Math.PI)).toFixed(3))
      }
      if (next) next.style.setProperty('--shade', (0.35 * (1 - f)).toFixed(3))
    } else if (f > 0) {
      if (cur) cur.style.clipPath = 'inset(0 50% 0 0)'
      if (next) next.style.clipPath = 'inset(0 0 0 50%)'
      leaf(front, cloneOf(i), `rotateY(${(-f * 180).toFixed(2)}deg)`)
      leaf(back, cloneOf(i + 1), `rotateY(${((1 - f) * 180).toFixed(2)}deg)`)
      const lift = Math.sin(f * Math.PI)
      front.style.setProperty('--shade', (0.55 * lift).toFixed(3))
      back.style.setProperty('--shade', (0.55 * lift).toFixed(3))
      if (f < 0.5) underR.style.setProperty('--shade', (0.5 * (1 - f) * lift).toFixed(3))
      else underL.style.setProperty('--shade', (0.5 * f * lift).toFixed(3))
    }
  }

  function leaf(el: HTMLElement, content: HTMLElement | null, transform: string): void {
    el.hidden = false
    if (el.firstElementChild !== content) el.replaceChildren(...(content ? [content] : []))
    el.style.transform = transform
  }

  // ---- motion ----
  function tick(t: number): void {
    const dt = Math.min(0.032, (t - last) / 1000 || 0.016)
    last = t
    ;[pos, vel] = step(pos, vel, target, dt, reduce.matches ? 0.32 : mode === 'spread' ? 0.62 : 0.5)
    if (settled(pos, vel, target)) {
      pos = target
      vel = 0
      running = false
      remember()
    }
    render()
    if (running) frame = requestAnimationFrame(tick)
  }
  function springTo(to: number, v?: number): void {
    target = clamp(Math.round(to), 0, units.length - 1)
    if (v !== undefined) vel = v
    if (!running) {
      running = true
      last = performance.now()
      frame = requestAnimationFrame(tick)
    }
  }
  /** The reader has the page: stop the spring before its next frame moves it. */
  function hold(p: number): void {
    cancelAnimationFrame(frame)
    running = false
    vel = 0
    pos = rubber(p, units.length - 1)
    render()
  }
  /** Far jumps (the bar, the index) skip ahead and turn only the last page. */
  function jump(to: number): void {
    const k = clamp(to, 0, units.length - 1)
    if (Math.abs(k - pos) > 1.5) {
      pos = k - Math.sign(k - pos)
      vel = 0
      render()
    }
    springTo(k)
  }
  /** The address follows the spread on screen, so a link shared from it opens there. */
  function remember(): void {
    const id = spreads[unitSpread[Math.round(pos)]]?.id
    const hash = id && id !== 'cover' ? `#${id}` : ''
    if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname + location.search)
  }
  const unitOfSpread = (id: string): number => unitSpread.indexOf(spreads.findIndex((s) => s.id === id))

  // ---- wheel and trackpad: scrub while the fingers move, commit one page per gesture ----
  const PAGE = 520
  let gesture: { base: number; acc: number } | null = null
  let idle = 0
  let swallow = 0
  let swallowTimer = 0
  addEventListener(
    'wheel',
    (e) => {
      if (zoom?.open || e.ctrlKey) return
      e.preventDefault()
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (!d) return
      const dir = Math.sign(d)
      // A trackpad keeps sending a decaying tail after the fingers lift; it belongs to the turn already made.
      if (swallow === dir) {
        clearTimeout(swallowTimer)
        swallowTimer = window.setTimeout(() => (swallow = 0), 180)
        return
      }
      swallow = 0
      gesture ??= { base: pos, acc: 0 }
      gesture.acc += d * (e.deltaMode === 1 ? 33 : 1)
      const to = nextPage(gesture.base, dir)
      clearTimeout(idle)
      if (Math.abs(gesture.acc) >= 90) {
        gesture = null
        swallow = dir
        swallowTimer = window.setTimeout(() => (swallow = 0), 180)
        springTo(to, Math.max(Math.abs(vel), 1.4) * dir)
        return
      }
      hold(gesture.base + gesture.acc / PAGE)
      idle = window.setTimeout(() => {
        const g = gesture
        gesture = null
        if (g) springTo(Math.abs(g.acc) > 24 ? to : Math.round(g.base))
      }, 120)
    },
    { passive: false }
  )

  // ---- touch and pen: the page follows the finger, then carries its speed (mouse keeps text selection) ----
  let drag: { id: number; x: number; y: number; base: number; axis: 'x' | 'y' | null; hist: [number, number][] } | null = null
  board.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !e.isPrimary) return
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, base: pos, axis: null, hist: [[e.timeStamp, pos]] }
  })
  board.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!drag.axis) {
      if (Math.hypot(dx, dy) < 10) return
      drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      board.setPointerCapture(e.pointerId)
      drag.base = pos
      drag.x = e.clientX
      drag.y = e.clientY
    }
    const span = drag.axis === 'x' ? innerWidth * 0.85 : innerHeight * 0.7
    hold(drag.base - (drag.axis === 'x' ? e.clientX - drag.x : e.clientY - drag.y) / span)
    drag.hist.push([e.timeStamp, pos])
    if (drag.hist.length > 6) drag.hist.shift()
  })
  const endDrag = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id) return
    const d = drag
    drag = null
    if (!d.axis) return
    const [t0, p0] = d.hist[0]
    const [t1, p1] = d.hist[d.hist.length - 1]
    const v = t1 > t0 ? ((p1 - p0) / (t1 - t0)) * 1000 : 0
    springTo(project(pos, v, d.base), v)
  }
  board.addEventListener('pointerup', endDrag)
  board.addEventListener('pointercancel', endDrag)

  // ---- keys ----
  addEventListener('keydown', (e) => {
    if (zoom?.open || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
    const fwd = ['ArrowRight', 'ArrowDown', 'PageDown']
    const bwd = ['ArrowLeft', 'ArrowUp', 'PageUp']
    let d = 0
    if (e.key === ' ') d = e.shiftKey ? -1 : 1
    else if (fwd.includes(e.key)) d = 1
    else if (bwd.includes(e.key)) d = -1
    else if (e.key === 'Home') return void (e.preventDefault(), jump(0))
    else if (e.key === 'End') return void (e.preventDefault(), jump(units.length - 1))
    if (!d) return
    e.preventDefault()
    springTo(target + d)
  })

  // ---- links inside the book, keyboard focus, the phone's full-screen look ----
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target : null
    const a = el?.closest<HTMLAnchorElement>('a[href^="#"]')
    if (a) {
      const k = unitOfSpread(a.hash.slice(1))
      if (k >= 0) {
        e.preventDefault()
        jump(k)
      }
      return
    }
    const img = el?.closest<HTMLImageElement>('[data-zoomable]')
    if (img && zoom && mode === 'single') {
      const big = document.createElement('img')
      big.src = img.currentSrc || img.src
      big.alt = img.alt
      zoom.querySelector('img')?.remove()
      zoom.prepend(big)
      zoom.showModal()
    }
  })
  zoom?.addEventListener('click', (e) => {
    if (e.target === zoom || e.target instanceof HTMLImageElement) zoom.close()
  })
  board.addEventListener('focusin', (e) => {
    const k = units.findIndex((u) => u.contains(e.target as Node))
    if (k >= 0 && k !== Math.round(target)) jump(k)
  })

  addEventListener('resize', () => {
    const next = pickMode()
    if (next !== mode) {
      cancelAnimationFrame(frame)
      running = false
      setUnits(next)
    }
    else {
      layout()
      render()
    }
  })
  addEventListener('hashchange', () => {
    const k = unitOfSpread(location.hash.slice(1))
    if (k >= 0) jump(k)
  })

  setUnits(mode)
  // Page heights change once the webfonts arrive; measure the fit again then.
  void document.fonts.ready.then(() => {
    layout()
    render()
  })
  const first = unitOfSpread(location.hash.slice(1))
  if (first > 0) {
    pos = target = first
    render()
  }
  root.classList.add('ready')
}
