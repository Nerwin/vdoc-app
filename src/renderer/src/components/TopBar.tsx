import { IS_MAC, shortcutLabel } from '../commands.ts'
import { BackIcon, ForwardIcon, HomeIcon, PanelToggleIcon, SearchIcon } from '../icons.tsx'

interface Props {
  sidebarOpen: boolean
  inspectorOpen: boolean
  /** The current view has an inspector - otherwise its toggle stays in place, dimmed. */
  inspectorAvailable: boolean
  canGoBack: boolean
  canGoForward: boolean
  onBack(): void
  onForward(): void
  onToggleSidebar(): void
  onToggleInspector(): void
  onOpenSearch(): void
  onOpenChanges(): void
}

/** One top bar for every view (R5 §2): fixed 150px clusters keep the search centred. */
export function TopBar(props: Props) {
  return (
    <header data-tour="topbar" className="drag-region flex h-[46px] shrink-0 items-center gap-3.5 border-b border-line bg-chrome px-[13px]">
      {IS_MAC && <div className="w-[58px] shrink-0" />}
      <span className="ml-1.5 inline-flex h-[28px] shrink-0 items-center gap-[7px] rounded-[5px] border border-wordmark-edge bg-wordmark-plate px-2.5 font-mono text-[11px] font-bold tracking-[1.5px]">
        <span className="text-wordmark-ink">VOSKER</span>
        <span className="h-[13px] w-px bg-wordmark-divider" />
        <span className="text-wordmark-accent">DOC</span>
      </span>

      <div className="flex w-[150px] shrink-0 items-center gap-0.5">
        <PanelToggle side="left" open={props.sidebarOpen} title={`Toggle sidebar - ${shortcutLabel('view.sidebar')}`} onClick={props.onToggleSidebar} />
        <div className="mx-[5px] h-[18px] w-px bg-line" />
        <ChromeButton title={`Changes - ${shortcutLabel('view.changes')}`} onClick={props.onOpenChanges} className="h-[28px] w-[28px] rounded-md text-ink-dim">
          <HomeIcon size={16} />
        </ChromeButton>
        <ChromeButton title={`Back - ${shortcutLabel('file.back')}`} onClick={props.onBack} disabled={!props.canGoBack} className="h-[26px] w-[26px] rounded-[5px] text-ink-body">
          <BackIcon size={15} />
        </ChromeButton>
        <ChromeButton title={`Forward - ${shortcutLabel('file.forward')}`} onClick={props.onForward} disabled={!props.canGoForward} className="h-[26px] w-[26px] rounded-[5px] text-ink-body">
          <ForwardIcon size={15} />
        </ChromeButton>
      </div>

      <div className="flex min-w-0 flex-1 justify-center">
        <button
          onClick={props.onOpenSearch}
          className="flex w-[380px] max-w-full items-center gap-[9px] rounded-md border border-line bg-well px-2.5 py-[5px] text-left hover:border-line-active"
        >
          <SearchIcon size={13} className="shrink-0 text-ink-label" />
          <span className="flex-1 truncate text-[12.5px] text-ink-label">Search documents or run a command</span>
          <span className="rounded-[3px] border border-line bg-row-hover px-[5px] py-px font-mono text-[10.5px] text-ink-dim">{shortcutLabel('file.goto')}</span>
        </button>
      </div>

      <div className="flex w-[150px] shrink-0 items-center justify-end gap-1">
        <PanelToggle
          side="right"
          open={props.inspectorAvailable && props.inspectorOpen}
          disabled={!props.inspectorAvailable}
          title={props.inspectorAvailable ? `Toggle inspector - ${shortcutLabel('view.info')}` : 'No inspector in this view'}
          onClick={props.onToggleInspector}
        />
      </div>
    </header>
  )
}

function PanelToggle({ side, open, disabled, title, onClick }: { side: 'left' | 'right', open: boolean, disabled?: boolean, title: string, onClick(): void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      aria-pressed={open}
      className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-md disabled:opacity-35 ${open ? 'bg-selected' : 'enabled:hover:bg-hover'}`}
    >
      <PanelToggleIcon side={side} open={open} />
    </button>
  )
}

function ChromeButton({ title, onClick, disabled, className, children }: { title: string, onClick(): void, disabled?: boolean, className: string, children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`flex shrink-0 items-center justify-center hover:bg-hover hover:text-ink disabled:text-ink-disabled disabled:hover:bg-transparent disabled:hover:text-ink-disabled ${className}`}
    >
      {children}
    </button>
  )
}
