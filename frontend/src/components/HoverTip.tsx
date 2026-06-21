import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  text: string
  children: ReactNode
  className?: string
}

/** Tooltip portaled to body so it isn't clipped by scroll containers. */
export function HoverTip({ text, children, className = '' }: Props) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  function show() {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ top: r.bottom + 8, left: r.left })
    setOpen(true)
  }

  return (
    <>
      <span
        ref={triggerRef}
        className={`inline-flex cursor-help border-b border-dotted border-pitch-500/50 ${className}`}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
        tabIndex={0}
      >
        {children}
      </span>
      {open &&
        createPortal(
          <div
            role="tooltip"
            style={{ top: pos.top, left: pos.left }}
            className="pointer-events-none fixed z-[9999] w-72 rounded-lg border border-pitch-600/80 bg-pitch-900 px-3 py-2 text-left text-[11px] font-normal leading-snug text-chalk shadow-xl"
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  )
}
