import { useEffect, type ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
  actions: ReactNode
  onClose(): void
}

export function Modal({ title, children, actions, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)]" onClick={onClose}>
      <div
        className="w-[480px] max-w-[90vw] rounded-xl border border-line-menu bg-overlay shadow-modal"
        onClick={event => event.stopPropagation()}
      >
        <h2 className="border-b border-line-subtle px-4 py-3 text-[13px] font-semibold text-ink">{title}</h2>
        <div className="max-h-[50vh] overflow-y-auto px-4 py-3 text-[12px] text-ink-dim">{children}</div>
        <div className="flex justify-end gap-2 rounded-b-xl border-t border-line-subtle bg-chrome px-4 py-3">{actions}</div>
      </div>
    </div>
  )
}

export function ModalButton({ label, onClick, primary, danger, disabled }: {
  label: string
  onClick(): void
  primary?: boolean
  danger?: boolean
  disabled?: boolean
}) {
  const tone = danger
    ? 'bg-conflict text-white hover:opacity-90'
    : primary
      ? 'border border-primary-edge bg-primary text-primary-ink hover:bg-primary-hover'
      : 'border border-control bg-raised text-ink-body hover:bg-hover'
  return (
    <button onClick={onClick} disabled={disabled} className={`rounded-md px-3 py-1.5 text-[12px] disabled:opacity-40 ${tone}`}>
      {label}
    </button>
  )
}
