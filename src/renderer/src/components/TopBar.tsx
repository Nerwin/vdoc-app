import type { RefObject } from 'react'

import darkLogo from '../assets/dark-logo.png'
import lightLogo from '../assets/light-logo.png'
import { shortcutLabel } from '../commands.ts'

interface Props {
  theme: 'dark' | 'light'
  filterText: string
  behindCount: number
  unverifiedCount: number
  /** A task is running — the global primary is disabled (progress lives in the status bar). */
  busy: boolean
  connected: boolean
  filterRef: RefObject<HTMLInputElement | null>
  onFilterText(text: string): void
  onPullBehind(): void
  onVerifyAll(): void
  onCheckAll(): void
  onOpenSettings(): void
  onOpenPalette(): void
  onOpenDashboard(): void
}

export function TopBar(props: Props) {
  // Global primary is contextual, one scope up from the pane: pull > verify > check.
  const primary = props.behindCount > 0
    ? { label: 'Pull behind', count: props.behindCount, run: props.onPullBehind }
    : props.unverifiedCount > 0
      ? { label: 'Verify all', count: props.unverifiedCount, run: props.onVerifyAll }
      : { label: 'Check all', count: 0, run: props.onCheckAll }

  return (
    <header className="drag-region flex h-[46px] shrink-0 items-center gap-4 border-b border-line bg-chrome pl-28 pr-3.5">
      <img
        src={props.theme === 'dark' ? darkLogo : lightLogo}
        alt="VOSKER DOC"
        className="h-[22px] w-auto shrink-0"
      />

      <div className="flex min-w-0 flex-1 justify-center">
        <div className="field-ring group flex w-[420px] max-w-full items-center gap-[9px] rounded-md border border-control bg-raised px-2.5 py-[5px]">
          <span className="text-[11px] text-ink-ghost">⌕</span>
          <input
            ref={props.filterRef}
            value={props.filterText}
            onChange={event => props.onFilterText(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                props.onFilterText('')
                event.currentTarget.blur()
              }
            }}
            placeholder="Filter files…"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink placeholder-ink-faint outline-none"
          />
          {/* The hint chip is the field's exit affordance once it has focus. */}
          <span className="rounded-[3px] bg-hover px-[5px] py-px text-[10.5px] text-ink-ghost">
            <span className="group-focus-within:hidden">{shortcutLabel('view.filterField')}</span>
            <span className="hidden group-focus-within:inline">esc</span>
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={primary.run}
          disabled={props.busy || !props.connected}
          className="flex items-center gap-2 whitespace-nowrap rounded-md border border-primary-edge bg-primary px-3.5 py-1.5 text-[12.5px] text-primary-ink hover:bg-primary-hover disabled:opacity-40"
        >
          {primary.label}
          {primary.count > 0 && (
            <span className="rounded-full bg-primary-badge px-1.5 py-px text-[11px]">{primary.count}</span>
          )}
        </button>
        {primary.label !== 'Check all' && (
          <button
            onClick={props.onCheckAll}
            disabled={props.busy || !props.connected}
            className="whitespace-nowrap rounded-md border border-control bg-raised px-[13px] py-1.5 text-[12.5px] text-ink-body hover:bg-hover disabled:opacity-40"
          >
            Check all
          </button>
        )}
        <div className="mx-0.5 h-5 w-px bg-line" />
        <ChromeButton title="Dashboard — overview of everything needing attention" onClick={props.onOpenDashboard}>⌂</ChromeButton>
        <ChromeButton title={`Command palette — ${shortcutLabel('app.palette')}`} onClick={props.onOpenPalette}>⌘</ChromeButton>
        <ChromeButton title={`Settings — ${shortcutLabel('app.settings')}`} onClick={props.onOpenSettings}>⚙</ChromeButton>
      </div>
    </header>
  )
}

function ChromeButton({ title, onClick, children }: { title: string, onClick(): void, children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-[26px] w-[26px] items-center justify-center rounded-md text-[15px] text-ink-label hover:bg-hover hover:text-ink"
    >
      {children}
    </button>
  )
}
