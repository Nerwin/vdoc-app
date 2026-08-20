import { useEffect, useMemo, useState } from 'react'

import type { DisplayState, VersionEntry } from '../../../shared/types.ts'
import { parseFrontmatter } from '../../../shared/frontmatter.ts'
import { displayState, needsAttention, type FileEntry } from '../../../shared/status.ts'
import { shortcutLabel } from '../commands.ts'
import { STATE_META } from '../state-meta.ts'
import type { SyncEvent, Visit } from '../useApp.ts'
import { StateDot } from './StateDot.tsx'

interface Props {
  entries: Map<string, FileEntry>
  authors: Map<string, VersionEntry | null>
  totals: { files: number, tracked: number }
  unverifiedCount: number
  busy: boolean
  lastChecked: Date | null
  recents: Visit[]
  activity: SyncEvent[]
  rootDirs: string[]
  loadAuthors(requests: Array<{ path: string, remoteVersion: number }>): void
  onSelect(path: string): void
  onVerifyAll(): void
  onCheckAll(): void
  onOpenFilePalette(): void
  onOpenCommandPalette(): void
  onOpenGetForm(): void
  /** A library card narrows the tree to that folder. */
  onFilterFolder(dir: string): void
}

const SEVERITY: DisplayState[] = ['conflict', 'not-found', 'behind', 'local-edits', 'ahead']

/** States where the remote moved — worth showing who changed it. */
const REMOTE_MOVED: DisplayState[] = ['conflict', 'behind']

const SECTION_LABEL = 'mb-2.5 text-[10.5px] uppercase tracking-[0.12em] text-ink-ghost'

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

  const recents = useMemo(
    () => props.recents.filter(visit => props.entries.has(visit.path)).slice(0, 4),
    [props.entries, props.recents],
  )

  // Doc titles come from the files' frontmatter — a filename is the fallback, never the goal.
  const [titles, setTitles] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    const missing = recents.filter(visit => !titles.has(visit.path))
    if (missing.length === 0) return
    let live = true
    void (async () => {
      const found = await Promise.all(missing.map(async visit => {
        const title = await window.vdoc.readFile(visit.path)
          .then(text => parseFrontmatter(text).title)
          .catch(() => undefined)
        return [visit.path, title ?? visit.path.split('/').at(-1) ?? visit.path] as const
      }))
      if (live) setTitles(prev => new Map([...prev, ...found]))
    })()
    return () => {
      live = false
    }
  }, [recents, titles])

  const folders = useMemo(() => props.rootDirs.map(dir => ({
    dir,
    count: [...props.entries.keys()].filter(path => path.startsWith(`${dir}/`)).length,
  })), [props.entries, props.rootDirs])

  const allInSync = attention.length === 0

  return (
    <div className="flex h-full flex-col overflow-y-auto px-8 py-6">
      <header className="mb-1 flex items-baseline gap-3">
        {allInSync && <span className="self-center"><StateDot state="in-sync" /></span>}
        <h1 className="font-sans text-[20px] font-semibold tracking-[-0.01em] text-ink">
          {allInSync ? 'All in sync' : `${attention.length} file${attention.length > 1 ? 's' : ''} need${attention.length === 1 ? 's' : ''} attention`}
        </h1>
        <span className="font-mono text-[11px] text-ink-faint">
          {props.totals.files} files · {props.totals.tracked} tracked
          {props.lastChecked && ` · checked ${timeAgo(props.lastChecked.toISOString())}`}
        </span>
      </header>

      {allInSync
        ? (
            <>
              <p className="mb-7 pl-[19px] text-[12px] text-ink-dim">Nothing to pull, push, or merge.</p>
              <div className="flex max-w-[1040px] gap-10">
                <div className="min-w-0 flex-[1.8]">
                  {recents.length > 0 && (
                    <section className="mb-7">
                      <h2 className={SECTION_LABEL}>Continue reading</h2>
                      <ul className="space-y-1.5">
                        {recents.map(visit => {
                          const entry = props.entries.get(visit.path)!
                          return (
                            <li key={visit.path}>
                              <button
                                onClick={() => props.onSelect(visit.path)}
                                className="flex w-full items-center gap-3 rounded-md border border-line bg-pane px-3.5 py-2.5 text-left hover:bg-row-hover"
                              >
                                <StateDot state={displayState(entry)} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-sans text-[13px] font-medium text-ink">
                                    {titles.get(visit.path) ?? visit.path.split('/').at(-1)}
                                  </span>
                                  <span className="block truncate font-mono text-[10.5px] text-ink-faint">{visit.path}</span>
                                </span>
                                <span className="shrink-0 font-mono text-[11px] text-ink-dim">{timeAgo(new Date(visit.at).toISOString())}</span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  )}

                  {folders.length > 0 && (
                    <section>
                      <h2 className={SECTION_LABEL}>Library</h2>
                      <div className="flex gap-1.5">
                        {folders.map(folder => (
                          <button
                            key={folder.dir}
                            onClick={() => props.onFilterFolder(folder.dir)}
                            title={`Show only ${folder.dir} in the tree`}
                            className="flex flex-1 flex-col items-start gap-1 rounded-md border border-line bg-pane px-3.5 py-3 text-left hover:bg-row-hover"
                          >
                            <span className="w-full truncate text-[12.5px] font-medium text-ink">{folder.dir}</span>
                            <span className="text-[11px] text-ink-label">{folder.count} docs</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <section className="mb-7">
                    <h2 className={SECTION_LABEL}>Quick actions</h2>
                    <div className="space-y-1.5">
                      <QuickAction label="Check all files" keycap={shortcutLabel('sync.checkAll')} onClick={props.onCheckAll} />
                      <QuickAction label="Jump to file" keycap={shortcutLabel('file.goto')} onClick={props.onOpenFilePalette} />
                      <QuickAction label="Get page from Confluence…" onClick={props.onOpenGetForm} />
                      <QuickAction label="Open command palette" keycap={shortcutLabel('app.palette')} onClick={props.onOpenCommandPalette} />
                    </div>
                  </section>

                  {props.activity.length > 0 && (
                    <section>
                      <h2 className={SECTION_LABEL}>Last sync activity</h2>
                      <div className="space-y-2 rounded-md border border-line bg-pane px-3.5 py-3">
                        {props.activity.slice(0, 3).map(event => (
                          <div key={`${event.op}-${event.path}-${event.at}`} className="flex items-baseline gap-2">
                            <span className={`shrink-0 text-[11px] ${event.op === 'pulled' ? 'text-sync-text' : 'text-behind'}`}>{event.op}</span>
                            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-mid">{event.path.split('/').at(-1)}</span>
                            <span className="shrink-0 font-mono text-[10.5px] text-ink-faint">{timeAgo(new Date(event.at).toISOString())}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              </div>
            </>
          )
        : (
            <ul className="mt-3 space-y-1">
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
          )}

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

function QuickAction({ label, keycap, onClick }: { label: string, keycap?: string, onClick(): void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-md border border-control bg-raised px-3 py-2 text-left text-[12.5px] text-ink-body hover:bg-hover"
    >
      <span className="truncate">{label}</span>
      {keycap && <span className="shrink-0 rounded-[3px] border border-keycap-edge bg-keycap-bg px-[5px] py-px text-[10.5px] text-keycap-ink">{keycap}</span>}
    </button>
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
