import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import { displayState, type FileEntry } from '../../../shared/status.ts'
import { fuzzyMatch, fuzzyRank, type FuzzyMatch } from '../../../shared/fuzzy.ts'
import { COMMANDS, fullLabel, keycaps, type Command, type CommandContext } from '../commands.ts'
import { StateDot } from './StateDot.tsx'

interface Props {
  ctx: CommandContext
  entries: Map<string, FileEntry>
  /** `command` opens pre-seeded with `> `; deleting it drops back to file mode. */
  mode: 'file' | 'command' | 'recent'
  /** Recently opened paths, newest first - the pool in `recent` mode. */
  recents: string[]
  onPick(path: string): void
  onRun(command: Command): void
  onClose(): void
}

const RECENT_KEY = 'paletteRecent'
const RECENT_MAX = 3
const FILE_LIMIT = 50

function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : []
  } catch {
    return []
  }
}

function pushRecent(id: string): void {
  localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter(other => other !== id)].slice(0, 8)))
}

/** Bold the matched characters - indices come from the ranking pass (one walk, not two). */
function Highlight({ text, indices }: { text: string, indices: number[] }) {
  const marked = new Set(indices)
  if (marked.size === 0) return <>{text}</>
  return (
    <>
      {[...text].map((char, index) => (
        marked.has(index)
          ? <span key={index} className="font-bold text-match">{char}</span>
          : <span key={index}>{char}</span>
      ))}
    </>
  )
}

interface Row {
  key: string
  group: string
  command?: Command
  /** Matched character positions in the command label, for highlighting. */
  indices?: number[]
  path?: string
  disabled?: string
}

export function CommandPalette({ ctx, entries, mode, recents, onPick, onRun, onClose }: Props) {
  const [query, setQuery] = useState(mode === 'command' ? '> ' : '')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  // The whole corpus re-ranks on every keystroke - defer it so typing never stutters.
  const deferred = useDeferredValue(query)
  const commandMode = deferred.startsWith('>')
  const search = commandMode ? deferred.slice(1).trim() : deferred

  // Focus returns where it came from when the overlay closes.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    return () => previous?.focus()
  }, [])

  const rows = useMemo<Row[]>(() => {
    if (!commandMode) {
      // Recent mode: rank within the recents pool, keeping recency order on an empty query.
      const pool = mode === 'recent' ? recents : [...entries.keys()]
      const ranked = mode === 'recent' && search === '' ? pool.slice(0, FILE_LIMIT) : fuzzyRank(search, pool, FILE_LIMIT)
      return ranked.map(path => ({ key: path, group: 'FILES', path }))
    }
    const ranked = COMMANDS
      .map(command => ({ command, match: fuzzyMatch(search, fullLabel(command)) }))
      .filter((item): item is { command: Command, match: FuzzyMatch } => item.match !== null)
      .sort((a, b) => a.match.score - b.match.score)
    const recentIds = readRecent().filter(id => ranked.some(item => item.command.id === id)).slice(0, RECENT_MAX)
    const row = (item: { command: Command, match: FuzzyMatch }, group: string): Row => ({
      key: `${group}:${item.command.id}`,
      group,
      command: item.command,
      indices: item.match.indices,
      disabled: item.command.reason?.(ctx),
    })
    const recent = recentIds.map(id => row(ranked.find(item => item.command.id === id)!, 'RECENT'))
    const rest = ranked.filter(item => !recentIds.includes(item.command.id))
    return [
      ...recent,
      ...rest.filter(item => item.command.group === 'Sync').map(item => row(item, 'SYNC')),
      ...rest.filter(item => item.command.group === 'File').map(item => row(item, 'FILE')),
      ...rest.filter(item => item.command.group === 'View' || item.command.group === 'App').map(item => row(item, 'VIEW & APP')),
    ]
  }, [commandMode, search, entries, ctx, mode, recents])

  useEffect(() => setIndex(0), [deferred])

  useEffect(() => {
    listRef.current?.querySelector(`[data-row="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index, rows])

  const activate = (row: Row): void => {
    if (row.path) {
      onPick(row.path)
      return
    }
    if (!row.command || row.disabled) return
    pushRecent(row.command.id)
    onRun(row.command)
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIndex(current => Math.min(current + 1, rows.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIndex(current => Math.max(current - 1, 0))
    } else if (event.key === 'Enter' && rows[index]) {
      event.preventDefault()
      activate(rows[index])
    }
  }

  const poolSize = mode === 'recent' ? recents.length : entries.size
  const noun = mode === 'recent' ? 'recent' : 'files'
  const counter = commandMode
    ? (search === '' ? `${COMMANDS.length} commands` : `${rows.length} of ${COMMANDS.length}`)
    : (search === '' ? `${poolSize} ${noun}` : `${rows.length} of ${poolSize}`)

  return (
    <div className="fixed inset-0 z-50 bg-[var(--scrim)]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        className="mx-auto mt-24 w-[660px] max-w-[92vw] overflow-hidden rounded-xl border border-line-menu bg-overlay shadow-palette"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line-subtle bg-sidebar px-[14px] py-3">
          {commandMode && <span className="text-[13px] font-bold text-accent">&gt;</span>}
          <input
            autoFocus
            value={commandMode ? query.replace(/^>\s*/, '') : query}
            onChange={event => setQuery(commandMode ? `> ${event.target.value}` : event.target.value)}
            onKeyDown={event => {
              // ⌫ on an empty command query drops back to file mode.
              if (event.key === 'Backspace' && commandMode && query.replace(/^>\s*/, '') === '') setQuery('')
              onKeyDown(event)
            }}
            placeholder={commandMode ? 'Type a command…' : mode === 'recent' ? 'Recent files…' : 'Go to file…'}
            spellCheck={false}
            className="min-w-0 flex-1 border-none bg-transparent font-mono text-[13px] text-ink placeholder-ink-faint outline-none focus:shadow-none"
          />
          <span className="shrink-0 font-mono text-[11px] text-ink-faint">{counter}</span>
        </div>

        <ul ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
          {rows.length === 0 && (
            <li className="px-[14px] py-3 font-mono text-[12px] text-ink-faint">
              {commandMode ? 'No matching command' : 'No matching files'}
            </li>
          )}
          {rows.map((row, position) => {
            const header = row.group !== rows[position - 1]?.group && commandMode
            return (
              <li key={row.key}>
                {header && (
                  <div className="px-[14px] pb-[5px] pt-[7px] font-mono text-[10.5px] tracking-[0.11em] text-ink-mute">
                    {row.group}
                  </div>
                )}
                {row.command
                  ? <CommandRow row={row} ctx={ctx} selected={position === index} onClick={() => activate(row)} position={position} />
                  : <FileRow path={row.path!} entries={entries} selected={position === index} onClick={() => activate(row)} position={position} />}
              </li>
            )
          })}
        </ul>

        <div className="flex items-center gap-4 border-t border-line-subtle bg-chrome px-[14px] py-2 font-mono text-[11px] text-ink-mute">
          <span>↑↓ navigate</span>
          <span>⏎ {commandMode ? 'run' : 'open'}</span>
          <span>{commandMode ? '⌫ clear > for file search' : '> for commands'}</span>
          <span className="flex-1" />
          <span>esc dismiss</span>
        </div>
      </div>
    </div>
  )
}

const TINT: Record<string, string> = {
  pull: 'text-behind',
  push: 'text-sync',
  create: 'text-sync',
}

function CommandRow({ row, ctx, selected, onClick, position }: {
  row: Row
  ctx: CommandContext
  selected: boolean
  onClick(): void
  position: number
}) {
  const command = row.command!
  const label = fullLabel(command)
  const suffix = row.disabled ?? command.suffix?.(ctx)
  const caps = keycaps(command.keys)

  return (
    <button
      data-row={position}
      onClick={onClick}
      title={row.disabled ? `${label} - ${row.disabled}` : label}
      className={`grid w-full grid-cols-[22px_1fr_auto] items-center gap-[10px] px-[14px] py-[7px] text-left ${
        selected ? 'bg-selected shadow-[inset_2px_0_0_var(--color-select-edge)]' : 'hover:bg-row-hover'
      }`}
    >
      <span className={`text-center text-[12px] ${row.disabled ? 'text-ink-ghost' : TINT[command.tint ?? ''] ?? 'text-ink-mute'}`}>
        {command.icon}
      </span>
      <span className={`min-w-0 truncate text-[13px] ${row.disabled ? 'text-ink-ghost' : 'text-ink'}`}>
        <Highlight text={label} indices={row.indices ?? []} />
        {suffix && <span className={row.disabled ? 'text-ink-ghost' : 'text-ink-dim'}> - {suffix}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-[3px]">
        {caps.length === 0
          ? <span className="text-[11px] text-ink-mute">-</span>
          : caps.map((cap, index) => (
              <kbd
                key={index}
                className="min-w-[18px] rounded border border-keycap-edge bg-keycap-bg px-[5px] py-px text-center text-[11px] font-normal text-keycap-ink"
              >
                {cap}
              </kbd>
            ))}
      </span>
    </button>
  )
}

function FileRow({ path, entries, selected, onClick, position }: {
  path: string
  entries: Map<string, FileEntry>
  selected: boolean
  onClick(): void
  position: number
}) {
  const entry = entries.get(path)
  const slash = path.lastIndexOf('/')
  return (
    <button
      data-row={position}
      onClick={onClick}
      className={`grid w-full grid-cols-[22px_1fr] items-center gap-[10px] px-[14px] py-[7px] text-left font-mono text-[12.5px] ${
        selected ? 'bg-selected shadow-[inset_2px_0_0_var(--color-select-edge)]' : 'hover:bg-row-hover'
      }`}
    >
      <span className="flex justify-center"><StateDot state={entry ? displayState(entry) : 'unchecked'} /></span>
      <span className="min-w-0 truncate">
        <span className="text-ink">{path.slice(slash + 1)}</span>
        <span className="text-ink-faint">  {path.slice(0, slash + 1)}</span>
      </span>
    </button>
  )
}
