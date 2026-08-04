import { useEffect, useState } from 'react'

import type { AuthStatus, DisplayState } from '../../../shared/types.ts'
import { STATE_META } from '../state-meta.ts'

interface Props {
  auth: AuthStatus | null
  counts: { byState: Map<DisplayState, number>, attention: number }
  checking: { done: number, total: number } | null
  lastChecked: Date | null
  busyOp: string | null
  stateFilter: DisplayState | 'attention' | null
  onFilterState(state: DisplayState | 'attention' | null): void
  onOpenToken(): void
}

const SUMMARY_STATES: DisplayState[] = ['behind', 'local-edits', 'ahead', 'conflict', 'not-found', 'unverified']

export function StatusBar(props: Props) {
  const tick = useMinuteTick()

  return (
    <footer className="flex h-7 items-center gap-3 border-t border-line bg-panel px-3 font-mono text-[11px] text-ink-dim">
      <AuthChip auth={props.auth} tick={tick} onClick={props.onOpenToken} />

      <span className="h-3 w-px bg-line" />

      {SUMMARY_STATES.map(state => {
        const count = props.counts.byState.get(state) ?? 0
        if (count === 0) return null
        const meta = STATE_META[state]
        const active = props.stateFilter === state
        return (
          <button
            key={state}
            onClick={() => props.onFilterState(active ? null : state)}
            className={`flex items-center gap-1 hover:text-ink ${active ? 'text-ink underline underline-offset-3' : ''}`}
            title={`${meta.label} — click to filter`}
          >
            <span className={meta.color}>{meta.glyph}</span>
            {count}
          </button>
        )
      })}
      {props.counts.attention === 0 && props.lastChecked && <span className="text-sync">all in sync</span>}

      <span className="flex-1" />

      {props.busyOp && <span className="text-accent">{props.busyOp}…</span>}
      {props.checking
        ? (
            <span className="flex items-center gap-2 text-accent">
              checking {props.checking.done}/{props.checking.total || '…'}
              <span className="h-1 w-24 overflow-hidden rounded bg-raised">
                <span
                  className="block h-full bg-accent transition-all"
                  style={{ width: props.checking.total ? `${(props.checking.done / props.checking.total) * 100}%` : '0%' }}
                />
              </span>
            </span>
          )
        : props.lastChecked && <span>checked {timeAgo(props.lastChecked, tick)}</span>}
    </footer>
  )
}

function AuthChip({ auth, tick, onClick }: { auth: AuthStatus | null, tick: number, onClick(): void }) {
  void tick
  if (!auth) return <button onClick={onClick} className="text-ink-faint">auth…</button>

  const expiry = auth.tokenExp ? auth.tokenExp * 1000 - Date.now() : null
  const expiringSoon = expiry !== null && expiry < 24 * 3600 * 1000
  const dot = !auth.ok ? 'text-conflict' : expiringSoon ? 'text-ahead' : 'text-sync'
  const label = !auth.ok
    ? 'not authenticated'
    : auth.method === 'api-token'
      ? auth.displayName
      : expiry !== null
        ? `${auth.displayName} · token ${expiry <= 0 ? 'expired' : formatDuration(expiry)}`
        : auth.displayName

  return (
    <button onClick={onClick} className="flex items-center gap-1.5 hover:text-ink" title="Confluence authentication — click to update the token">
      <span className={dot}>●</span>
      {label}
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

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  return hours > 0 ? `${hours}h${String(minutes).padStart(2, '0')}` : `${minutes}m`
}

function timeAgo(date: Date, tick: number): string {
  void tick
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}
