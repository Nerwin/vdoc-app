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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[480px] max-w-[90vw] rounded-xl border border-line bg-panel shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <h2 className="border-b border-line px-4 py-3 text-[13px] font-semibold text-ink">{title}</h2>
        <div className="max-h-[50vh] overflow-y-auto px-4 py-3 text-[12px] text-ink-dim">{children}</div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{actions}</div>
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
    ? 'bg-conflict/80 text-white hover:bg-conflict'
    : primary
      ? 'bg-accent/80 text-white hover:bg-accent'
      : 'border border-line bg-raised text-ink hover:bg-line'
  return (
    <button onClick={onClick} disabled={disabled} className={`rounded-md px-3 py-1.5 text-[12px] disabled:opacity-40 ${tone}`}>
      {label}
    </button>
  )
}
