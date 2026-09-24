import { AlertIcon, CloseIcon, InfoIcon } from '../icons.tsx'
import type { Message } from '../useApp.ts'

const TONE = {
  info: {
    icon: InfoIcon,
    surface: 'border-info-edge bg-info-bg',
    accent: 'text-info-ink',
    edge: 'var(--color-behind)',
  },
  error: {
    icon: AlertIcon,
    surface: 'border-bad-edge bg-bad-bg',
    accent: 'text-bad-ink',
    edge: 'var(--color-conflict)',
  },
}

/** Auto-dismisses on a timer (see useApp); the close button is the manual exit. */
export function Toast({ message, onDismiss }: { message: Message, onDismiss(): void }) {
  const tone = TONE[message.kind]
  return (
    <div
      role="status"
      style={{ boxShadow: `inset 3px 0 0 ${tone.edge}, var(--shadow-menu)` }}
      className={`fixed bottom-11 right-4 z-40 flex w-96 max-w-[80vw] items-start gap-2.5 rounded-lg border py-2.5 pl-3.5 pr-2 ${tone.surface}`}
    >
      <tone.icon size={14} className={`mt-px shrink-0 ${tone.accent}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-[12px] leading-[1.5] ${tone.accent}`}>{message.text}</p>
        {message.detail && (
          <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-ink-dim">
            {message.detail.map((line, index) => <li key={index} className="break-words">{line}</li>)}
          </ul>
        )}
      </div>
      <button
        onClick={onDismiss}
        title="Dismiss"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-mute hover:bg-hover hover:text-ink"
      >
        <CloseIcon size={12} />
      </button>
    </div>
  )
}
