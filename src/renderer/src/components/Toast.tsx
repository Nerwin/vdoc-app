import type { Message } from '../useApp.ts'

export function Toast({ message, onDismiss }: { message: Message, onDismiss(): void }) {
  return (
    <button
      onClick={onDismiss}
      className={`fixed right-4 top-14 z-40 w-96 max-w-[80vw] rounded-lg border bg-raised px-3.5 py-2.5 text-left shadow-xl ${
        message.kind === 'error' ? 'border-conflict/50' : 'border-line'
      }`}
    >
      <p className={`text-[12px] ${message.kind === 'error' ? 'text-conflict' : 'text-ink'}`}>{message.text}</p>
      {message.detail && (
        <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-ink-dim">
          {message.detail.map((line, index) => <li key={index} className="truncate">{line}</li>)}
        </ul>
      )}
    </button>
  )
}
