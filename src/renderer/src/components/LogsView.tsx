import { useEffect, useState } from 'react'

import { LOG_MAX, type VdocLogEntry } from '../../../shared/types.ts'

/** Every CLI command the app spawned this session, newest first - the debugging trail. */
export function LogsView({ notify, onClose }: { notify(text: string): void, onClose(): void }) {
  const [entries, setEntries] = useState<VdocLogEntry[]>([])
  const [openId, setOpenId] = useState<number | null>(null)
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [menu, setMenu] = useState<{ x: number, y: number, entry: VdocLogEntry } | null>(null)

  useEffect(() => {
    void window.vdoc.logs().then(setEntries)
    return window.vdoc.onVdocLog(entry => setEntries(prev => [...prev.slice(-(LOG_MAX - 1)), entry]))
  }, [])

  // Esc closes the context menu first, then the page; capture keeps the global
  // Esc handling (filter, dashboard) out of it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        if (menu) setMenu(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [menu, onClose])

  const shown = [...entries].reverse().filter(entry => !errorsOnly || entry.exitCode !== 0)

  const copy = (text: string, what: string): void => {
    setMenu(null)
    void navigator.clipboard.writeText(text).then(() => notify(`${what} copied`)).catch(() => undefined)
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-pane">
      <div className="flex items-center gap-3 px-[18px] pb-[13px] pt-3.5">
        <h1 className="text-[15px] font-medium text-ink">CLI logs</h1>
        <span className="text-[12px] text-ink-faint">
          {entries.length} command(s) this session - exit code 1 with results is normal (findings, not failure)
        </span>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-[12px] text-ink-dim">
          <input type="checkbox" checked={errorsOnly} onChange={event => setErrorsOnly(event.target.checked)} />
          non-zero exits only
        </label>
        <button
          onClick={onClose}
          className="rounded-md border border-control bg-raised px-3 py-1.5 text-[12.5px] text-ink-body hover:bg-hover"
        >
          Close <span className="text-ink-ghost">esc</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line bg-content">
        {shown.length === 0
          ? <div className="flex h-full items-center justify-center text-[12px] text-ink-faint">No commands recorded yet</div>
          : shown.map(entry => (
              <LogRow
                key={entry.id}
                entry={entry}
                open={openId === entry.id}
                onToggle={() => setOpenId(current => (current === entry.id ? null : entry.id))}
                onMenu={event => {
                  event.preventDefault()
                  setMenu({ x: event.clientX, y: event.clientY, entry })
                }}
              />
            ))}
      </div>

      {menu && (
        <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} onContextMenu={event => { event.preventDefault(); setMenu(null) }}>
          <div
            className="absolute w-48 overflow-hidden rounded-lg border border-line-menu bg-overlay py-1 shadow-menu"
            style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 130) }}
            onClick={event => event.stopPropagation()}
          >
            <CopyItem label="Copy command" onClick={() => copy(`vdoc ${menu.entry.args.join(' ')}`, 'Command')} />
            <CopyItem label="Copy stderr" disabled={menu.entry.stderr.trim() === ''} onClick={() => copy(menu.entry.stderr, 'stderr')} />
            <CopyItem label="Copy stdout" disabled={menu.entry.stdout.trim() === ''} onClick={() => copy(menu.entry.stdout, 'stdout')} />
          </div>
        </div>
      )}
    </div>
  )
}

function CopyItem({ label, disabled, onClick }: { label: string, disabled?: boolean, onClick(): void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="block w-full px-3 py-1.5 text-left text-[12.5px] text-ink-body hover:bg-row-hover disabled:text-ink-ghost disabled:hover:bg-transparent"
    >
      {label}
    </button>
  )
}

function LogRow({ entry, open, onToggle, onMenu }: { entry: VdocLogEntry, open: boolean, onToggle(): void, onMenu(event: React.MouseEvent): void }) {
  const failed = entry.exitCode !== 0
  return (
    <div className="border-b border-line">
      <button onClick={onToggle} onContextMenu={onMenu} className="flex w-full items-center gap-3 px-[18px] py-2 text-left hover:bg-hover">
        <span className="shrink-0 text-[11px] text-ink-faint">{new Date(entry.at).toLocaleTimeString()}</span>
        <span className={`w-14 shrink-0 text-[11px] ${failed ? 'text-conflict' : 'text-sync-text'}`}>
          {failed ? `exit ${entry.exitCode}` : 'ok'}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-body">vdoc {entry.args.join(' ')}</span>
        <span className="shrink-0 text-[11px] text-ink-ghost">{entry.durationMs} ms</span>
      </button>
      {open && (
        <div className="space-y-2 px-[18px] pb-3">
          <OutputBlock label="stderr (CLI log)" text={entry.stderr} />
          <OutputBlock label="stdout" text={entry.stdout} />
        </div>
      )}
    </div>
  )
}

function OutputBlock({ label, text }: { label: string, text: string }) {
  return (
    <div>
      <div className="pb-1 text-[10.5px] tracking-[0.12em] text-ink-ghost">{label.toUpperCase()}</div>
      {text.trim() === ''
        ? <div className="text-[11px] text-ink-faint">(empty)</div>
        : (
            <pre className="max-h-72 overflow-auto rounded-[5px] border border-line bg-raised p-2.5 font-mono text-[11px] leading-[1.5] text-ink-dim">
              {text}
            </pre>
          )}
    </div>
  )
}
