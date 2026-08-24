import { useEffect, useState } from 'react'

import type { AuthStatus, TriageFilter } from '../../../shared/types.ts'
import { humanTtl, timeAgo } from '../../../shared/time.ts'
import { StateDot } from './StateDot.tsx'

interface Props {
  auth: AuthStatus | null
  counts: { attention: number, behind: number, unverified: number, dirty: number }
  checking: { done: number, total: number } | null
  lastChecked: Date | null
  busyOp: string | null
  appVersion: string | null
  stateFilter: TriageFilter
  onFilterState(filter: TriageFilter): void
  onOpenToken(): void
  onOpenLogs(): void
  onCancelCheck(): void
}

export function StatusBar(props: Props) {
  useMinuteTick() // re-render each minute so the relative times below stay fresh
  const offline = props.auth !== null && !props.auth.ok

  return (
    <footer data-tour="statusbar" className="flex h-8 shrink-0 items-center gap-3 border-t border-line bg-chrome px-3 font-mono text-[11.5px]">
      <AuthChip auth={props.auth} onClick={props.onOpenToken} />

      <div className="h-4 w-px bg-line" />

      {offline
        ? (
            <button onClick={props.onOpenToken} className="whitespace-nowrap rounded-[5px] px-2 py-[3px] text-conflict hover:bg-hover">
              Not connected — reconnect
            </button>
          )
        : (
            <div className="flex min-w-0 items-center gap-1">
              {props.counts.attention > 0 && (
                <Counter
                  active={props.stateFilter === 'attention'}
                  title="Filter tree: needs attention"
                  tone="text-attention"
                  onClick={() => props.onFilterState(props.stateFilter === 'attention' ? null : 'attention')}
                >
                  <span>⚠</span>
                  <span>{props.counts.attention}<span className="hidden min-[1100px]:inline"> needs attention</span></span>
                </Counter>
              )}
              {props.counts.behind > 0 && (
                <Counter
                  active={props.stateFilter === 'behind'}
                  title="Filter tree: behind remote"
                  tone="text-ink-dim"
                  onClick={() => props.onFilterState(props.stateFilter === 'behind' ? null : 'behind')}
                >
                  <span className="text-behind">↓</span>
                  <span>{props.counts.behind}<span className="hidden min-[1100px]:inline"> behind</span></span>
                </Counter>
              )}
              {props.counts.unverified > 0 && (
                <Counter
                  active={props.stateFilter === 'unverified'}
                  title="Filter tree: unverified"
                  tone="text-ink-dim"
                  onClick={() => props.onFilterState(props.stateFilter === 'unverified' ? null : 'unverified')}
                >
                  <StateDot state="unverified" />
                  <span>{props.counts.unverified}<span className="hidden min-[1100px]:inline"> unverified</span></span>
                </Counter>
              )}
              {props.counts.attention === 0 && props.counts.behind === 0 && props.counts.unverified === 0 && props.lastChecked && (
                <span className="flex items-center gap-1.5 whitespace-nowrap px-2 text-sync-text">
                  <StateDot state="in-sync" />
                  All tracked files in sync
                </span>
              )}
            </div>
          )}

      <div className="flex-1" />

      <TaskSlot
        checking={props.checking}
        busyOp={props.busyOp}
        lastChecked={props.lastChecked}
        onCancelCheck={props.onCancelCheck}
      />

      <div className="h-4 w-px bg-line" />
      <button
        onClick={props.onOpenLogs}
        title="Every CLI command this session, with its output"
        className="whitespace-nowrap rounded-[5px] px-2 py-[3px] text-ink-ghost hover:bg-hover hover:text-ink"
      >
        Logs
      </button>

      {props.appVersion && (
        <>
          <div className="h-4 w-px bg-line" />
          <span title="Up to date" className="whitespace-nowrap text-ink-ghost">v{props.appVersion}</span>
        </>
      )}
    </footer>
  )
}

function Counter({ active, title, tone, onClick, children }: {
  active: boolean
  title: string
  tone: string
  onClick(): void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2 py-[3px] ${tone} ${active ? 'bg-hover' : 'hover:bg-hover hover:text-ink'}`}
    >
      {children}
    </button>
  )
}

/** Only ever one task in the slot; idle shows the last-checked time — never blank. */
function TaskSlot({ checking, busyOp, lastChecked, onCancelCheck }: {
  checking: { done: number, total: number } | null
  busyOp: string | null
  lastChecked: Date | null
  onCancelCheck(): void
}) {
  if (checking) {
    return (
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="whitespace-nowrap text-ink-dim">Checking files</span>
        <span className="whitespace-nowrap text-ink-faint">{checking.done} / {checking.total || '…'}</span>
        <ProgressTrack>
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-200 ease-linear"
            style={{ width: checking.total ? `${(checking.done / checking.total) * 100}%` : '0%' }}
          />
        </ProgressTrack>
        <button
          onClick={onCancelCheck}
          title="Cancel"
          className="flex h-[18px] w-[18px] items-center justify-center rounded text-[10px] text-ink-faint hover:bg-hover hover:text-ink"
        >
          ✕
        </button>
      </div>
    )
  }
  if (busyOp) {
    return (
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="whitespace-nowrap text-ink-dim">{taskLabel(busyOp)}</span>
        <ProgressTrack>
          <div className="indeterminate-fill h-full w-[30%] rounded-full bg-accent" />
        </ProgressTrack>
      </div>
    )
  }
  if (lastChecked) {
    return <span className="whitespace-nowrap text-ink-faint">last checked {timeAgo(lastChecked)}</span>
  }
  return null
}

function ProgressTrack({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-1 w-[132px] overflow-hidden rounded-full bg-track max-[960px]:w-[72px]">
      {children}
    </div>
  )
}

const TASK_LABELS: Record<string, string> = {
  'pull': 'Pulling',
  'push': 'Pushing',
  'push preview': 'Preparing push',
  'check': 'Checking',
  'check folder': 'Checking folder',
  'sync': 'Finding page',
  'create': 'Creating page',
  'lint': 'Linting',
  'verify': 'Verifying',
  'save token': 'Saving token',
  'save API key': 'Saving API key',
  'switch auth': 'Switching auth',
}

function taskLabel(op: string): string {
  if (op.startsWith('verify ')) return `Verifying ${op.slice('verify '.length)}`
  return TASK_LABELS[op] ?? op
}

function AuthChip({ auth, onClick }: { auth: AuthStatus | null, onClick(): void }) {
  if (!auth) return <button onClick={onClick} className="text-ink-ghost">auth…</button>

  const expiryMs = auth.tokenExp ? auth.tokenExp * 1000 - Date.now() : null
  const expired = expiryMs !== null && expiryMs <= 0
  const expiringSoon = expiryMs !== null && !expired && expiryMs < 24 * 3600 * 1000
  const dot = !auth.ok || expired ? 'bg-conflict' : expiringSoon ? 'bg-warn' : 'bg-sync'
  const title = !auth.ok
    ? (auth.error ?? 'Not authenticated — click to update credentials')
    : auth.tokenExp
      ? `Authenticated — token expires ${new Date(auth.tokenExp * 1000).toLocaleString()}`
      : 'Authenticated'

  return (
    <button onClick={onClick} title={title} className="flex shrink-0 items-center gap-2 whitespace-nowrap">
      <span className={`h-[7px] w-[7px] rounded-full ${dot}`} />
      <span className="text-ink-mid">{auth.displayName ?? (auth.ok ? 'authenticated' : 'not authenticated')}</span>
      {auth.ok && expiryMs !== null && (
        <span className="hidden items-center gap-2 min-[1000px]:flex">
          <span className="text-sep">·</span>
          <span className={expired ? 'text-conflict' : expiringSoon ? 'text-warn' : 'text-ink-label'}>
            {expired ? 'token expired' : `token ${humanTtl(expiryMs)}${expiringSoon ? ' ⚠' : ''}`}
          </span>
        </span>
      )}
    </button>
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

