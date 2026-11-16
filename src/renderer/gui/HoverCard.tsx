// A card shown while the pointer rests on a link in the chat (Figma 90A / 90B): under the link, left edges aligned
// (over it when there is no room below), kept inside the window. It opens after a short rest and stays while the
// pointer moves into it, so its buttons can be reached. Rendered into the window's body (see session-meta/Popover).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useWindowScope } from '../state/window-scope'
import styles from './Chat.module.css'

const OPEN_MS = 350
const CLOSE_MS = 150
const EDGE = 8
const GAP = 4

/** Open / close timing shared by a link and its card: `hover` handlers go on both. */
export function useHoverCard(): { open: boolean; hover: { onPointerEnter(): void; onPointerLeave(): void }; close(): void } {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const clear = (): void => window.clearTimeout(timer.current)
  useEffect(() => clear, [])
  const onPointerEnter = useCallback(() => {
    clear()
    timer.current = window.setTimeout(() => setOpen(true), OPEN_MS)
  }, [])
  const onPointerLeave = useCallback(() => {
    clear()
    timer.current = window.setTimeout(() => setOpen(false), CLOSE_MS)
  }, [])
  const close = useCallback(() => {
    clear()
    setOpen(false)
  }, [])
  return { open, hover: { onPointerEnter, onPointerLeave }, close }
}

export function HoverCard({
  anchor,
  hover,
  onClose,
  children,
  className,
  testId
}: {
  anchor: RefObject<HTMLElement | null>
  hover: { onPointerEnter(): void; onPointerLeave(): void }
  onClose(): void
  children: ReactNode
  className?: string
  testId?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { win } = useWindowScope()
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const card = ref.current
    const box = anchor.current?.getBoundingClientRect()
    if (!card || !box) return
    const left = Math.max(EDGE, Math.min(box.left, win.innerWidth - EDGE - card.offsetWidth))
    const below = box.bottom + GAP
    const top = below + card.offsetHeight > win.innerHeight - EDGE ? Math.max(EDGE, box.top - GAP - card.offsetHeight) : below
    setPosition({ left, top })
  }, [anchor, win, children])

  // A scroll moves the link away from the card; Esc closes it like any popover.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    win.addEventListener('scroll', onClose, true)
    win.addEventListener('keydown', onKeyDown)
    win.addEventListener('blur', onClose)
    return () => {
      win.removeEventListener('scroll', onClose, true)
      win.removeEventListener('keydown', onKeyDown)
      win.removeEventListener('blur', onClose)
    }
  }, [onClose, win])

  return createPortal(
    <div
      ref={ref}
      className={className ? `${styles.hoverCard} ${className}` : styles.hoverCard}
      data-testid={testId}
      style={position ? { left: position.left, top: position.top } : { visibility: 'hidden', left: 0, top: 0 }}
      {...hover}
    >
      {children}
    </div>,
    win.document.body
  )
}
