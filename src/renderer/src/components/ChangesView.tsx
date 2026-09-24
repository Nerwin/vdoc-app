import { useEffect, useMemo, useRef, useState } from 'react'

import type { ChangesScope, DisplayState, SyncGroup, VersionEntry } from '../../../shared/types.ts'
import { CHANGE_GROUPS, displayState, displayTitle, syncGroup, type FileEntry } from '../../../shared/status.ts'
import { displayAuthor } from '../../../shared/confluence.ts'
import { timeAgo } from '../../../shared/time.ts'
import { command, forPath, shortcutLabel, type CommandContext } from '../commands.ts'
import { ArrowRightIcon, CheckIcon, CloseIcon, MoreIcon } from '../icons.tsx'
import { GROUP_META, STATE_META } from '../state-meta.ts'
import { ActionMenu } from './ActionMenu.tsx'
import { StateGlyph } from './StateGlyph.tsx'

interface Props {
  ctx: CommandContext
  entries: Map<string, FileEntry>
  counts: { files: number, tracked: number, attention: number, remote: number, unchecked: number }
  authors: Map<string, VersionEntry | null>
  checking: { done: number, total: number } | null
  lastChecked: Date | null
  busy: boolean
  scope: ChangesScope
  bulkResult: { text: string, at: number } | null
  findings: Set<string>
  /** False while a dialog or overlay owns the keyboard. */
  keyboard: boolean
  loadAuthors(requests: Array<{ path: string, remoteVersion: number }>): void
  onReview(path: string): void
  onResolve(path: string): void
  onPullAll(paths: string[]): void
  onPushAll(paths: string[]): void
  onCheckAll(): void
  onCancelCheck(): void
  onCheckUnchecked(): void
  onClearScope(): void
}

interface Row {
  entry: FileEntry
  state: DisplayState
}

const ROW_LIMIT = 3
const BULK_STRIP_MS = 4000

const ROW_MENU: Record<'remote' | 'local' | 'conflict', string[]> = {
  remote: ['sync.pull'],
  local: ['sync.push'],
  conflict: ['sync.forcePush', 'sync.forcePull'],
}
const ROW_MENU_COMMON = ['file.editor', 'file.finder', 'file.copyUrl', 'file.browser', 'file.ignore']

const GROUP_TITLE: Record<SyncGroup, string> = {
  synced: 'synced',
  local: 'with local changes',
  remote: 'with remote changes',
  conflict: 'in conflict',
  unchecked: 'not checked',
  unlinked: 'without a page',
  ignored: 'ignored',
}

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`

const pullAll = command('sync.pullAll')

/** The home screen: what needs attention, grouped by state, cheap work first. */
export function ChangesView(props: Props) {
  const { entries, scope, loadAuthors } = props
  const [expanded, setExpanded] = useState<Set<SyncGroup>>(() => new Set())
  const [menu, setMenu] = useState<string | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  useTick(props.bulkResult ? BULK_STRIP_MS : null)

  const groups = useMemo(() => {
    const result = new Map<SyncGroup, Row[]>()
    for (const group of CHANGE_GROUPS) result.set(group, [])
    for (const entry of entries.values()) {
      const state = displayState(entry)
      result.get(syncGroup(state))?.push({ entry, state })
    }
    for (const rows of result.values()) rows.sort(byRecency(props.authors))
    return result
  }, [entries, props.authors])

  // Rows already resolved update in place while a check runs - no re-sort mid-run.
  const orderRef = useRef<Map<SyncGroup, string[]>>(new Map())
  const ordered = useMemo(() => {
    const next = new Map<SyncGroup, Row[]>()
    for (const [group, rows] of groups) {
      const previous = props.checking ? orderRef.current.get(group) ?? [] : []
      const byPath = new Map(rows.map(row => [row.entry.path, row]))
      const kept = previous.flatMap(path => (byPath.has(path) ? [byPath.get(path)!] : []))
      const fresh = rows.filter(row => !previous.includes(row.entry.path))
      next.set(group, [...kept, ...fresh])
    }
    orderRef.current = new Map([...next].map(([group, rows]) => [group, rows.map(row => row.entry.path)]))
    return next
  }, [groups, props.checking])

  useEffect(() => {
    const requests = [...(ordered.get('remote') ?? []), ...(ordered.get('conflict') ?? [])]
      .filter(row => row.entry.check?.remoteVersion !== undefined)
      .map(row => ({ path: row.entry.path, remoteVersion: row.entry.check!.remoteVersion! }))
    if (requests.length > 0) loadAuthors(requests)
  }, [ordered, loadAuthors])

  const visibleGroups = CHANGE_GROUPS.filter(group => (scope ? group === scope : true))
  const attention = visibleGroups.reduce((sum, group) => sum + (ordered.get(group)?.length ?? 0), 0)
  const scanning = entries.size === 0
  const empty = !scanning && attention === 0
  const showBulk = props.bulkResult !== null && Date.now() - props.bulkResult.at < BULK_STRIP_MS

  const navigable = visibleGroups.flatMap(group => {
    const rows = ordered.get(group) ?? []
    return expanded.has(group) ? rows : rows.slice(0, ROW_LIMIT)
  })
  const open = (row: Row): void => (row.state === 'conflict' ? props.onResolve(row.entry.path) : props.onReview(row.entry.path))
  const navRef = useRef({ navigable, focused, open })
  navRef.current = { navigable, focused, open }

  useEffect(() => {
    if (!props.keyboard || menu !== null) return
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return
      const { navigable: rows, focused: current, open: openRow } = navRef.current
      const index = rows.findIndex(row => row.entry.path === current)
      const down = event.key === 'ArrowDown' || event.key === 'j'
      const up = event.key === 'ArrowUp' || event.key === 'k'
      if (down || up) {
        if (rows.length === 0) return
        const next = rows[down ? Math.min(index + 1, rows.length - 1) : Math.max(index - 1, 0)]
        setFocused(next.entry.path)
        document.querySelector(`[data-change="${CSS.escape(next.entry.path)}"]`)?.scrollIntoView({ block: 'nearest' })
      } else if (event.key === 'Enter' && index !== -1 && !(target instanceof HTMLButtonElement)) {
        openRow(rows[index])
      } else {
        return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.keyboard, menu])

  const title = scope
    ? `${plural(attention, 'document')} ${GROUP_TITLE[scope]}`
    : `${plural(attention, 'document')} need${attention === 1 ? 's' : ''} your attention`

  const calm = empty && !props.checking && !scope

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {!calm && (
      <header className="flex items-end gap-4 px-[30px] pb-[18px] pt-[26px]">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="text-[21px] font-semibold tracking-[-0.2px] text-ink">{title}</h1>
          {props.checking
            ? (
                <div className="flex items-center gap-2.5 text-[12.5px] text-ink-mute">
                  <span>Checking {props.checking.done} of {props.checking.total || '…'}…</span>
                  <div className="h-1 w-[132px] overflow-hidden rounded-full bg-track">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-200 ease-linear"
                      style={{ width: props.checking.total ? `${(props.checking.done / props.checking.total) * 100}%` : '0%' }}
                    />
                  </div>
                  <button onClick={props.onCancelCheck} title="Cancel" className="flex items-center rounded p-[3px] text-ink-label hover:bg-hover hover:text-ink"><CloseIcon size={11} /></button>
                </div>
              )
            : (
                <span className="text-[12.5px] text-ink-mute">
                  {props.lastChecked ? `Checked ${timeAgo(props.lastChecked, 'long')}` : 'Not checked yet'} · {plural(props.counts.files, 'document')} · {props.counts.tracked} tracked
                  {scope && (
                    <>
                      {' · '}
                      <button onClick={props.onClearScope} className="text-accent hover:underline">Show all changes</button>
                    </>
                  )}
                </span>
              )}
        </div>
        <div data-tour="changes-actions" className="flex shrink-0 items-center gap-2">
          <RecheckButton {...props} />
          {props.counts.remote > 0 && (
            <button
              onClick={() => pullAll.run(props.ctx)}
              disabled={pullAll.reason?.(props.ctx) !== undefined}
              title={pullAll.reason?.(props.ctx) ?? `${pullAll.label} - ${shortcutLabel('doc.primary')}`}
              className="flex items-center gap-2 whitespace-nowrap rounded-md border border-primary-edge bg-primary px-[14px] py-[7px] text-[12.5px] font-medium text-primary-ink hover:bg-primary-hover disabled:opacity-40"
            >
              <span className="text-[11px]">↓</span>Pull {plural(props.counts.remote, 'remote update')}
            </button>
          )}
        </div>
      </header>
      )}

      {props.counts.unchecked > 0 && !scanning && (
        <div className={`mx-[30px] mb-5 flex items-center gap-3 rounded-[7px] border border-line bg-chrome px-[14px] py-[10px] ${calm ? 'mt-[26px]' : ''}`}>
          <span className="text-[12px] text-ink-mute">○</span>
          <span className="whitespace-nowrap text-[12.5px] text-ink-body">{plural(props.counts.unchecked, 'document')} {props.counts.unchecked === 1 ? 'has' : 'have'} never been checked</span>
          <span className="min-w-0 truncate text-[11.5px] text-ink-mute">- content is compared against Confluence and recorded as a baseline</span>
          <span className="flex-1" />
          <button
            onClick={props.onCheckUnchecked}
            disabled={props.busy || props.checking !== null || !props.ctx.connected}
            className="whitespace-nowrap rounded-md border border-line bg-raised px-3 py-[5px] text-[12px] text-control-ink hover:bg-hover disabled:opacity-40"
          >
            Check all {props.counts.unchecked}
          </button>
        </div>
      )}

      {showBulk && props.bulkResult && (
        <div className="mx-[30px] mb-5 flex items-center gap-3 rounded-[7px] border border-ok-edge bg-ok-bg px-[14px] py-[10px] text-[12.5px] text-ok-ink">
          <CheckIcon size={13} className="shrink-0" />
          <span>{props.bulkResult.text}</span>
        </div>
      )}

      {scanning && (
        <div className="flex flex-col gap-px px-[30px]">
          {[0, 1, 2].map(index => (
            <div key={index} className="flex h-14 animate-pulse items-center gap-4 border-b border-row-sep px-3">
              <div className="flex flex-1 flex-col gap-2"><div className="h-3 w-48 rounded bg-raised" /><div className="h-2.5 w-72 rounded bg-raised" /></div>
              <div className="h-7 w-20 rounded-md bg-raised" />
            </div>
          ))}
        </div>
      )}

      {empty && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 pb-16">
          <span className="text-[18px] text-sync">●</span>
          <span className="text-[20px] font-semibold text-ink">Everything is in sync</span>
          <span className="text-[12.5px] text-ink-mute">
            {plural(props.counts.files, 'document')}{props.lastChecked ? ` · checked ${timeAgo(props.lastChecked, 'long')}` : ''}
          </span>
          <div className="mt-2"><RecheckButton {...props} /></div>
        </div>
      )}

      {!scanning && !empty && (
        <div className="flex flex-col gap-[26px] px-[30px] pb-5">
          {visibleGroups.map(group => {
            const rows = ordered.get(group) ?? []
            if (rows.length === 0) return null
            const shown = expanded.has(group) ? rows : rows.slice(0, ROW_LIMIT)
            const paths = rows.map(row => row.entry.path)
            return (
              <section key={group} className="flex flex-col">
                <div className="flex items-center gap-[11px] pb-2.5">
                  <StateGlyph group={group} className="text-[12px]" />
                  <span className="text-[12px] font-semibold uppercase tracking-[0.8px] text-ink-body">{GROUP_META[group].label}</span>
                  <span className="font-mono text-[11.5px] text-ink-mute">{rows.length}</span>
                  <span className="flex-1" />
                  {group === 'remote' && (
                    <BulkLink disabled={props.busy || !props.ctx.connected} onClick={() => props.onPullAll(paths)}>Pull all {rows.length}</BulkLink>
                  )}
                  {group === 'local' && (
                    <BulkLink disabled={props.busy || !props.ctx.connected} onClick={() => props.onPushAll(paths)}>Push all {rows.length}</BulkLink>
                  )}
                  {group === 'conflict' && <span className="text-[11.5px] text-ink-mute">resolve individually</span>}
                </div>
                <div className="flex flex-col">
                  {shown.map((row, index) => (
                    <ChangeRow
                      key={row.entry.path}
                      row={row}
                      group={group}
                      last={index === shown.length - 1 && shown.length === rows.length}
                      focused={focused === row.entry.path}
                      finding={props.findings.has(row.entry.path)}
                      onFocus={() => setFocused(row.entry.path)}
                      author={row.entry.check?.remoteVersion !== undefined ? props.authors.get(`${row.entry.path}@v${row.entry.check.remoteVersion}`) : undefined}
                      menuOpen={menu === row.entry.path}
                      ctx={props.ctx}
                      onReview={() => open(row)}
                      onMenu={open => setMenu(open ? row.entry.path : null)}
                    />
                  ))}
                  {rows.length > ROW_LIMIT && !expanded.has(group) && (
                    <button
                      onClick={() => setExpanded(prev => new Set(prev).add(group))}
                      className="self-start px-3 py-2.5 text-[11.5px] text-ink-mute hover:text-ink-body"
                    >
                      Show {rows.length - ROW_LIMIT} more
                    </button>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BulkLink({ children, disabled, onClick }: { children: React.ReactNode, disabled: boolean, onClick(): void }) {
  return (
    <button onClick={onClick} disabled={disabled} className="text-[11.5px] text-link hover:text-link-hover hover:underline disabled:text-ink-mute disabled:no-underline">
      {children}
    </button>
  )
}

/** Remote-moved groups sort by who changed it last; the rest by path. */
function byRecency(authors: Map<string, VersionEntry | null>) {
  const at = (row: Row): number => {
    const version = row.entry.check?.remoteVersion
    const author = version === undefined ? undefined : authors.get(`${row.entry.path}@v${version}`)
    return author ? new Date(author.createdAt).getTime() : 0
  }
  return (a: Row, b: Row): number => at(b) - at(a) || a.entry.path.localeCompare(b.entry.path)
}

function RecheckButton(props: Props) {
  return (
    <button
      onClick={props.checking ? props.onCancelCheck : props.onCheckAll}
      disabled={!props.checking && (props.busy || !props.ctx.connected)}
      title={props.checking ? 'Cancel the running check' : `Check workspace - ${shortcutLabel('sync.checkAll')}`}
      className="whitespace-nowrap rounded-md border border-control bg-raised px-[13px] py-[7px] text-[12px] text-control-ink hover:bg-hover disabled:opacity-40"
    >
      {props.checking ? 'Cancel' : 'Recheck workspace'}
    </button>
  )
}

function ChangeRow({ row, group, last, focused, finding, author, menuOpen, ctx, onFocus, onReview, onMenu }: {
  row: Row
  group: SyncGroup
  last: boolean
  focused: boolean
  finding: boolean
  author: VersionEntry | null | undefined
  menuOpen: boolean
  ctx: CommandContext
  onFocus(): void
  onReview(): void
  onMenu(open: boolean): void
}) {
  const { entry, state } = row
  const check = entry.check
  const conflict = state === 'conflict'
  const versions = group === 'remote'
    ? `Confluence v${check?.remoteVersion ?? '-'} · Local v${check?.localVersion ?? '-'}`
    : `Local v${check?.localVersion ?? '-'} · Confluence v${check?.remoteVersion ?? '-'}`
  const remoteContext = author === undefined ? '…' : author === null ? '' : `updated ${timeAgo(author.createdAt)} by ${displayAuthor(author.author)}`
  const edited = entry.mtimeMs === undefined ? '' : `edited ${timeAgo(entry.mtimeMs)}`
  const localContext = edited || (state === 'ahead' ? 'local version ahead' : state === 'no-version' ? 'never published' : 'edited since the last sync')
  const top = group === 'conflict'
    ? { text: conflict ? 'both sides changed' : STATE_META[state].label.toLowerCase(), tone: 'text-conflict' }
    : finding
      ? { text: '1 validation finding', tone: 'text-warn-text' }
      : { text: versions, tone: 'text-ink-body' }
  const bottom = group === 'conflict' || finding ? versions : group === 'remote' ? remoteContext : localContext
  const surface = focused
    ? 'rounded-[7px] bg-selected shadow-[inset_2px_0_0_var(--color-select-edge)]'
    : menuOpen ? 'bg-row-hover' : 'hover:bg-row-hover'

  return (
    <div
      data-change={entry.path}
      onMouseDown={onFocus}
      className={`flex h-14 items-center gap-4 px-3 ${last ? '' : 'border-b border-row-sep'} ${surface}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[13.5px] font-medium text-ink">{displayTitle(entry)}</span>
        <span className="truncate font-mono text-[11px] text-ink-mute">{entry.path}</span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`text-[12px] ${top.tone}`}>{top.text}</span>
        <span className="text-[11px] text-ink-mute">{bottom}</span>
      </div>
      <button
        onClick={onReview}
        className={`flex items-center gap-[7px] whitespace-nowrap rounded-md border px-[13px] py-[6px] text-[12px] ${
          conflict
            ? 'border-danger-edge bg-danger text-danger-ink hover:bg-danger-hover'
            : focused ? 'border-control bg-line-subtle text-ink hover:bg-hover' : 'border-line bg-raised text-control-ink hover:bg-hover'
        }`}
      >
        {conflict ? 'Resolve' : 'Review'}<ArrowRightIcon size={12} className={conflict ? 'text-danger-ink/70' : 'text-ink-mute'} />
      </button>
      <div className="relative">
        <button
          onClick={() => onMenu(!menuOpen)}
          title="More actions"
          className="flex h-[26px] w-[26px] items-center justify-center rounded-[5px] text-ink-mute hover:bg-hover hover:text-ink"
        >
          <MoreIcon size={14} />
        </button>
        {menuOpen && (
          <ActionMenu
            ctx={forPath(ctx, entry.path)}
            items={[...(group === 'remote' || group === 'local' || group === 'conflict' ? ROW_MENU[group] : []), ...ROW_MENU_COMMON]}
            onClose={() => onMenu(false)}
          />
        )}
      </div>
    </div>
  )
}

/** Re-render once after `ms` so a transient strip can disappear on its own. */
function useTick(ms: number | null): void {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (ms === null) return
    const timer = setTimeout(() => setTick(value => value + 1), ms)
    return () => clearTimeout(timer)
  }, [ms])
}
