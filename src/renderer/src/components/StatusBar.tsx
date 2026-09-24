import { useEffect, useRef, useState } from 'react'

import type { CliOutcome } from '../../../shared/cli-status.ts'
import type { AppUpdateStatus, AuthStatus, ChangesScope } from '../../../shared/types.ts'
import { humanTtl } from '../../../shared/time.ts'
import { shortcutLabel } from '../commands.ts'
import { CloseIcon, SettingsIcon } from '../icons.tsx'
import { OutcomeIcon, StateGlyph } from './StateGlyph.tsx'

interface Props {
  auth: AuthStatus | null
  site: string | null
  counts: { attention: number, remote: number, unchecked: number }
  checking: { done: number, total: number } | null
  busyOp: string | null
  appVersion: string | null
  update: AppUpdateStatus | null
  /** Most severe CLI result this session - the ambient error indicator. */
  cliOutcome: CliOutcome
  onOpenChanges(scope: ChangesScope): void
  onOpenToken(): void
  onOpenLogs(): void
  onCancelCheck(): void
  onCheckUpdate(): void
  onInstallUpdate(): void
  onOpenSettings(): void
}

export function StatusBar(props: Props) {
  useMinuteTick() // re-render each minute so the token countdown stays fresh

  return (
    <footer data-tour="statusbar" className="flex h-[30px] shrink-0 items-center gap-1 border-t border-line bg-chrome px-[14px] text-[11.5px]">
      <ConnectionButton auth={props.auth} site={props.site} onRefresh={props.onOpenToken} />

      {props.checking
        ? (
            <div className="flex items-center gap-2.5 pl-2">
              <span className="whitespace-nowrap text-ink-dim">Checking {props.checking.done} of {props.checking.total || '…'}</span>
              <ProgressTrack>
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200 ease-linear"
                  style={{ width: props.checking.total ? `${(props.checking.done / props.checking.total) * 100}%` : '0%' }}
                />
              </ProgressTrack>
              <button onClick={props.onCancelCheck} title="Cancel" className="flex h-[18px] w-[18px] items-center justify-center rounded text-[10px] text-ink-label hover:bg-hover hover:text-ink"><CloseIcon size={11} /></button>
            </div>
          )
        : props.busyOp
          ? (
              <div className="flex items-center gap-2.5 pl-2">
                <span className="whitespace-nowrap text-ink-dim">{taskLabel(props.busyOp)}</span>
                <ProgressTrack><div className="indeterminate-fill h-full w-[30%] rounded-full bg-accent" /></ProgressTrack>
              </div>
            )
          : (
              <>
                {props.counts.attention > 0 && (
                  <BarButton title="Open Changes" onClick={() => props.onOpenChanges(null)}>
                    <span className="text-warn">⚠</span>{props.counts.attention} attention
                  </BarButton>
                )}
                {props.counts.remote > 0 && (
                  <BarButton title="Open Changes - remote changes only" onClick={() => props.onOpenChanges('remote')}>
                    <StateGlyph group="remote" />{props.counts.remote} remote
                  </BarButton>
                )}
                {props.counts.unchecked > 0 && (
                  <BarButton title="Open Changes - the not-checked strip" muted onClick={() => props.onOpenChanges(null)}>
                    <StateGlyph group="unchecked" />{props.counts.unchecked} not checked
                  </BarButton>
                )}
              </>
            )}

      <div className="flex-1" />

      <BarButton title={`CLI logs - ${shortcutLabel('app.logs')}`} onClick={props.onOpenLogs}>
        <OutcomeIcon outcome={props.cliOutcome} size={11} />CLI logs
      </BarButton>

      {props.appVersion && <UpdateControl version={props.appVersion} status={props.update} onCheck={props.onCheckUpdate} onInstall={props.onInstallUpdate} />}

      <button
        onClick={props.onOpenSettings}
        title={`Settings - ${shortcutLabel('app.settings')}`}
        className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-md text-ink-dim hover:bg-hover hover:text-ink"
      >
        <SettingsIcon size={15} />
      </button>
    </footer>
  )
}

function BarButton({ title, muted, onClick, children }: { title: string, muted?: boolean, onClick(): void, children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-[7px] whitespace-nowrap rounded px-[7px] py-[3px] hover:bg-hover ${muted ? 'text-ink-dim' : 'text-ink-body'}`}
    >
      {children}
    </button>
  )
}

function ProgressTrack({ children }: { children: React.ReactNode }) {
  return <div className="h-1 w-[132px] overflow-hidden rounded-full bg-track max-[960px]:w-[72px]">{children}</div>
}

const TASK_LABELS: Record<string, string> = {
  'pull': 'Pulling',
  'push': 'Pushing',
  'push preview': 'Preparing push',
  'merge': 'Merging',
  'check': 'Checking',
  'check folder': 'Checking folder',
  'sync': 'Finding page',
  'create': 'Creating page',
  'lint': 'Linting',
  'verify': 'Verifying',
  'get': 'Fetching page',
  'ignore': 'Updating frontmatter',
  'pin': 'Updating frontmatter',
  'initialize frontmatter': 'Initializing frontmatter',
  'save token': 'Saving token',
  'save API key': 'Saving API key',
  'switch auth': 'Switching auth',
  'remove credential': 'Removing credential',
  'check update': 'Checking for updates',
  'install update': 'Installing update',
}

function taskLabel(op: string): string {
  if (op.startsWith('verify ')) return `Verifying ${op.slice('verify '.length)}`
  return TASK_LABELS[op] ?? op
}

function UpdateControl(props: { version: string, status: AppUpdateStatus | null, onCheck(): void, onInstall(): void }) {
  const { status } = props

  if (status?.phase === 'downloaded') {
    return (
      <button onClick={props.onInstall} title={`Restart and install V-DOC ${status.latest ?? 'update'}`} className="whitespace-nowrap rounded px-[7px] py-[3px] text-accent hover:bg-hover">
        Restart to update to v{status.latest ?? '?'}
      </button>
    )
  }

  if (status?.phase === 'available' || status?.phase === 'downloading') {
    const progress = status.progress === undefined ? '' : ` ${status.progress}%`
    return (
      <span title="The verified update will install when V-DOC exits" className="whitespace-nowrap px-[7px] py-[3px] font-mono text-[11px] text-accent">
        Downloading v{status.latest ?? '?'}{progress}
      </span>
    )
  }

  const title = status?.phase === 'checking'
    ? 'Checking for updates…'
    : status?.phase === 'error'
      ? 'The last update check failed - try again'
      : status?.phase === 'unsupported'
        ? 'Automatic updates are available in packaged builds'
        : 'Check for updates'

  return (
    <button onClick={props.onCheck} title={title} className="flex items-center gap-1.5 whitespace-nowrap rounded px-[7px] py-[3px] font-mono text-[11px] text-ink-mute hover:bg-hover hover:text-ink-body">
      v{props.version}
      {status?.phase === 'checking' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
    </button>
  )
}

/** `● Confluence connected` - identity and token live in the popover, not the bar. */
function ConnectionButton({ auth, site, onRefresh }: { auth: AuthStatus | null, site: string | null, onRefresh(): void }) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    const onClick = (event: MouseEvent): void => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onClick)
    }
  }, [open])

  const expiryMs = auth?.tokenExp ? auth.tokenExp * 1000 - Date.now() : null
  const expired = expiryMs !== null && expiryMs <= 0
  const expiringSoon = expiryMs !== null && !expired && expiryMs < 24 * 3600 * 1000
  // Remaining time follows the name for session tokens only - an API key shows nothing after it.
  const ttl = auth?.method === 'session-token' && expiryMs !== null && !expired ? expiryMs : null
  const label = !auth
    ? { glyph: '○', text: 'Connecting…', tone: 'text-ink-label' }
    : !auth.ok || expired
      ? { glyph: <CloseIcon size={11} />, text: 'Not connected', tone: 'text-conflict' }
      : { glyph: '●', text: auth.displayName ?? 'Confluence connected', tone: 'text-sync' }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen(value => !value)}
        title="Confluence - account, token and site"
        className={`flex items-center gap-[7px] whitespace-nowrap rounded px-[7px] py-[3px] hover:bg-hover ${label.tone === 'text-sync' ? 'text-ink-body' : label.tone}`}
      >
        <span className={`flex ${label.tone}`}>{label.glyph}</span>{label.text}
        {label.tone === 'text-sync' && ttl !== null && (
          <>
            <span className="text-ink-label">·</span>
            <span className={ttl < 2 * 3600 * 1000 ? 'text-warn' : 'text-ink-dim'}>{humanTtl(ttl)} left</span>
          </>
        )}
      </button>
      {open && auth && (
        <div className="absolute bottom-full left-0 z-30 mb-1.5 w-[280px] rounded-lg border border-line-menu bg-overlay p-3 shadow-menu">
          <dl className="flex flex-col gap-2 text-[11.5px]">
            <PopoverRow label="Account">{auth.displayName ?? (auth.ok ? 'authenticated' : 'not authenticated')}</PopoverRow>
            <PopoverRow label="Method">{auth.method}</PopoverRow>
            {expiryMs !== null && (
              <PopoverRow label="Token">
                <span className={expired ? 'text-conflict' : expiringSoon ? 'text-warn' : ''}>{expired ? 'expired' : `expires in ${humanTtl(expiryMs)}`}</span>
              </PopoverRow>
            )}
            <PopoverRow label="Site"><span className="font-mono">{site ?? '-'}</span></PopoverRow>
            {!auth.ok && auth.error && <PopoverRow label="Error"><span className="text-conflict">{auth.error}</span></PopoverRow>}
          </dl>
          <button
            onClick={() => {
              setOpen(false)
              onRefresh()
            }}
            className="mt-3 w-full rounded-md border border-control bg-raised px-3 py-1.5 text-[12px] text-ink-body hover:bg-hover"
          >
            Refresh credentials
          </button>
        </div>
      )}
    </div>
  )
}

function PopoverRow({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-[64px] shrink-0 text-ink-label">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-ink-body">{children}</dd>
    </div>
  )
}

function useMinuteTick(): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick(value => value + 1), 60_000)
    return () => clearInterval(timer)
  }, [])
  return tick
}
