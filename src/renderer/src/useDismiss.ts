import { useEffect, useRef } from 'react'

/**
 * Closes a popover: Esc (captured, so nothing behind it reacts) and, with `inside`, a mousedown
 * outside that element. `inside` is read at event time, so it may return a parent element.
 */
export function useDismiss(open: boolean, onClose: () => void, inside?: () => Element | null | undefined): void {
  const insideRef = useRef(inside)
  insideRef.current = inside

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    const onMouseDown = (event: MouseEvent): void => {
      if (insideRef.current && !insideRef.current()?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onMouseDown)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onMouseDown)
    }
  }, [open, onClose])
}
