import darkLogo from '../assets/dark-logo.png'
import lightLogo from '../assets/light-logo.png'
import { IS_MAC, shortcutLabel } from '../commands.ts'

interface Props {
  theme: 'dark' | 'light'
  remoteCount: number
  /** A task is running - the global primary is disabled (progress lives in the status bar). */
  busy: boolean
  connected: boolean
  canGoBack: boolean
  canGoForward: boolean
  onBack(): void
  onForward(): void
  onPullAll(): void
  onOpenSettings(): void
  onOpenSearch(): void
  onOpenChanges(): void
}

export function TopBar(props: Props) {
  return (
    <header data-tour="topbar" className={`drag-region flex h-[46px] shrink-0 items-center gap-3.5 border-b border-line bg-chrome pr-3.5 ${IS_MAC ? 'pl-24' : 'pl-3.5'}`}>
      <img src={props.theme === 'dark' ? darkLogo : lightLogo} alt="VOSKER DOC" className="h-[22px] w-auto shrink-0" />

      <div className="flex items-center gap-0.5">
        <ChromeButton title={`Back - ${shortcutLabel('file.back')}`} onClick={props.onBack} disabled={!props.canGoBack}>‹</ChromeButton>
        <ChromeButton title={`Forward - ${shortcutLabel('file.forward')}`} onClick={props.onForward} disabled={!props.canGoForward}>›</ChromeButton>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center">
        <button
          onClick={props.onOpenSearch}
          className="flex w-[380px] max-w-full items-center gap-[9px] rounded-md border border-line bg-sidebar px-2.5 py-[5px] text-left hover:border-line-active"
        >
          <span className="text-[11px] text-ink-label">⌕</span>
          <span className="flex-1 truncate text-[12.5px] text-ink-label">Search documents or run a command</span>
          <span className="rounded-[3px] border border-line bg-log-sep px-[5px] py-px font-mono text-[10.5px] text-ink-mute">{shortcutLabel('file.goto')}</span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {props.remoteCount > 0 && (
          <>
            <button
              onClick={props.onPullAll}
              disabled={props.busy || !props.connected}
              className="flex items-center gap-2 whitespace-nowrap rounded-md border border-primary-edge bg-primary px-[13px] py-[6px] text-[12.5px] font-medium text-primary-ink hover:bg-primary-hover disabled:opacity-40"
            >
              <span className="text-[11px]">↓</span>Pull {props.remoteCount} remote update{props.remoteCount === 1 ? '' : 's'}
            </button>
            <div className="mx-0.5 h-[18px] w-px bg-line" />
          </>
        )}
        <ChromeButton title={`Changes - ${shortcutLabel('view.changes')}`} onClick={props.onOpenChanges}>
          <Icon d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
        </ChromeButton>
        <ChromeButton title={`Settings - ${shortcutLabel('app.settings')}`} onClick={props.onOpenSettings}>
          <Icon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </ChromeButton>
      </div>
    </header>
  )
}

function ChromeButton({ title, onClick, disabled, children }: { title: string, onClick(): void, disabled?: boolean, children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-[15px] text-ink-mute hover:bg-hover hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ink-mute"
    >
      {children}
    </button>
  )
}

/** 18px stroke icon on a 24-unit grid. */
function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}
