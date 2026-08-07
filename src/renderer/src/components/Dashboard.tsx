import { useEffect, useMemo } from 'react'

import type { DisplayState, VersionEntry } from '../../../shared/types.ts'
import { displayState, needsAttention, type FileEntry } from '../../../shared/status.ts'
import { STATE_META } from '../state-meta.ts'
import { StateDot } from './StateDot.tsx'

interface Props {
  entries: Map<string, FileEntry>
  authors: Map<string, VersionEntry | null>
  totals: { files: number, tracked: number }
  unverifiedCount: number
  busy: boolean
  loadAuthors(requests: Array<{ path: string, remoteVersion: number }>): void
  onSelect(path: string): void
  onVerifyAll(): void
}

const SEVERITY: DisplayState[] = ['conflict', 'not-found', 'behind', 'local-edits', 'ahead']

/** States where the remote moved — worth showing who changed it. */
const REMOTE_MOVED: DisplayState[] = ['conflict', 'behind']

export function Dashboard(props: Props) {
  const attention = useMemo(
    () => [...props.entries.values()]
      .map(entry => ({ entry, state: displayState(entry) }))
      .filter(item => needsAttention(item.state))
      .sort((a, b) => SEVERITY.indexOf(a.state) - SEVERITY.indexOf(b.state) || a.entry.path.localeCompare(b.entry.path)),
    [props.entries],
  )

  const { loadAuthors } = props
  useEffect(() => {
    const requests = attention
      .filter(item => REMOTE_MOVED.includes(item.state) && item.entry.check?.remoteVersion !== undefined)
      .map(item => ({ path: item.entry.path, remoteVersion: item.entry.check!.remoteVersion! }))
    if (requests.length > 0) loadAuthors(requests)
  }, [attention, loadAuthors])

  return (
    <div className="flex h-full flex-col overflow-y-auto px-8 py-6">
      <header className="mb-4 flex items-baseline gap-3">
        <h1 className="text-[15px] font-semibold text-ink">
          {attention.length === 0 ? 'All in sync' : `${attention.length} file${attention.length > 1 ? 's' : ''} need${attention.length === 1 ? 's' : ''} attention`}
        </h1>
        <span className="font-mono text-[11px] text-ink-faint">
          {props.totals.files} files · {props.totals.tracked} tracked
        </span>
      </header>

      {attention.length === 0 && (
        <p className="text-[12px] text-ink-dim">
          Nothing to pull, push, or merge. Select a file on the left, or press ⌘P to jump to one.
        </p>
      )}

      <ul className="space-y-1">
        {attention.map(({ entry, state }) => {
          const meta = STATE_META[state]
          const check = entry.check
          const author = check?.remoteVersion !== undefined
            ? props.authors.get(`${entry.path}@v${check.remoteVersion}`)
            : undefined
          return (
            <li key={entry.path}>
              <button
                onClick={() => props.onSelect(entry.path)}
                className="flex w-full items-baseline gap-3 rounded-md border border-line bg-pane px-3 py-2 text-left hover:bg-row-hover"
              >
                <span className="flex w-4 justify-center self-center"><StateDot state={state} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[12px] text-ink">{entry.path.split('/').at(-1)}</span>
                  <span className="block truncate font-mono text-[10px] text-ink-faint">{entry.path}</span>
                </span>
                <span className={`font-mono text-[11px] ${meta.color}`}>{meta.label}</span>
                {check && (
                  <span className="font-mono text-[11px] text-ink-dim">
                    v{check.localVersion ?? '—'} → v{check.remoteVersion ?? '—'}
                  </span>
                )}
                {REMOTE_MOVED.includes(state) && (
                  <span className="w-44 truncate text-right font-mono text-[11px] text-ink-dim">
                    {author === undefined ? '…' : author === null ? '' : `${displayAuthor(author.author)} · ${timeAgo(author.createdAt)}`}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {props.unverifiedCount > 0 && (
        <footer className="mt-6 border-t border-line pt-4">
          <p className="mb-2 text-[12px] text-ink-dim">
            <span className="text-warn">◌</span> {props.unverifiedCount} tracked file(s) have no local-edit baseline —
            content is compared against Confluence and, when identical, the baseline is recorded so they can turn green.
          </p>
          <button
            onClick={props.onVerifyAll}
            disabled={props.busy}
            className="rounded-md border border-pill-edge bg-pill-bg px-2.5 py-1 text-[12px] text-pill-ink hover:opacity-90 disabled:opacity-40"
          >
            Verify all unverified ({props.unverifiedCount})
          </button>
        </footer>
      )}
    </div>
  )
}

/** Raw Atlassian account ids (not mapped in the metadata file) are noise — soften them. */
function displayAuthor(author: string): string {
  return /^\w+:[\w-]{20,}$/.test(author) ? 'unmapped user' : author
}

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / (24 * 60))}d ago`
}
