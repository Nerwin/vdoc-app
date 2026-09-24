import { useEffect, useRef } from 'react'

import { command, keycaps, IS_MAC, type CommandContext, type MenuItem } from '../commands.ts'

interface Props {
  ctx: CommandContext
  /** Registry ids, in order - keycaps and availability come from the registry, the label too unless overridden. */
  items: MenuItem[]
  align?: 'left' | 'right'
  onClose(): void
}

/** The `⋯` menu: registry commands aimed at one document. Esc closes, ↑↓ move, click outside closes. */
export function ActionMenu({ ctx, items, align = 'right', onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      if (items.length === 0) return
      const index = items.findIndex(item => item === document.activeElement)
      const next = event.key === 'ArrowDown' ? items[(index + 1) % items.length] : items[(index - 1 + items.length) % items.length]
      next.focus()
    }
    const onClick = (event: MouseEvent): void => {
      // The wrapper also holds the trigger button - its own onClick handles the toggle.
      if (!menuRef.current?.parentElement?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onClick)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className={`absolute top-full z-30 mt-1 w-[248px] rounded-lg border border-line-menu bg-overlay p-1.5 shadow-menu ${align === 'right' ? 'right-0' : 'left-0'}`}
      onClick={event => event.stopPropagation()}
    >
      {items.map(item => {
        const id = typeof item === 'string' ? item : item.id
        const cmd = command(id)
        const label = typeof item === 'string' ? cmd.label : item.label
        const reason = cmd.reason?.(ctx)
        const suffix = cmd.suffix?.(ctx)
        const caps = keycaps(cmd.keys).join(IS_MAC ? '' : '+')
        return (
          <button
            key={id}
            disabled={reason !== undefined}
            title={reason ? `${label} - ${reason}` : suffix ? `${label} - ${suffix}` : label}
            onClick={() => {
              onClose()
              cmd.run(ctx)
            }}
            className={`flex w-full items-center justify-between gap-3 rounded px-2.5 py-1.5 text-left text-[12.5px] hover:bg-selected disabled:hover:bg-transparent ${
              cmd.tint === 'danger' ? 'text-conflict disabled:text-ink-label' : 'text-ink-body disabled:text-ink-label'
            }`}
          >
            <span className="truncate">{label}</span>
            {reason
              ? <span className="shrink-0 text-[10.5px] text-ink-label">{reason}</span>
              : caps && <span className="shrink-0 font-mono text-[11px] text-ink-label">{caps}</span>}
          </button>
        )
      })}
    </div>
  )
}
