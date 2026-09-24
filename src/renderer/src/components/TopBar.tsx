import darkLogo from '../assets/dark-logo.png'
import lightLogo from '../assets/light-logo.png'
import { IS_MAC, shortcutLabel } from '../commands.ts'
import { BackIcon, ForwardIcon, HomeIcon, SearchIcon, SettingsIcon } from '../icons.tsx'

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
        <ChromeButton title={`Back - ${shortcutLabel('file.back')}`} onClick={props.onBack} disabled={!props.canGoBack}><BackIcon size={16} /></ChromeButton>
        <ChromeButton title={`Forward - ${shortcutLabel('file.forward')}`} onClick={props.onForward} disabled={!props.canGoForward}><ForwardIcon size={16} /></ChromeButton>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center">
        <button
          onClick={props.onOpenSearch}
          className="flex w-[380px] max-w-full items-center gap-[9px] rounded-md border border-line bg-sidebar px-2.5 py-[5px] text-left hover:border-line-active"
        >
          <SearchIcon size={13} className="shrink-0 text-ink-label" />
          <span className="flex-1 truncate text-[12.5px] text-ink-label">Search documents or run a command</span>
          <span className="rounded-[3px] border border-line bg-row-hover px-[5px] py-px font-mono text-[10.5px] text-ink-mute">{shortcutLabel('file.goto')}</span>
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
          <HomeIcon size={16} />
        </ChromeButton>
        <ChromeButton title={`Settings - ${shortcutLabel('app.settings')}`} onClick={props.onOpenSettings}>
          <SettingsIcon size={16} />
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
      className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-ink-mute hover:bg-hover hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ink-mute"
    >
      {children}
    </button>
  )
}

