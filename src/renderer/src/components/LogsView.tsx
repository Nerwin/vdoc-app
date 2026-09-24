import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { cliStatus, detectFormat, documentOf, interpretCli, rerunTarget, type CliOutcome, type CliStatus, type RerunTarget } from '../../../shared/cli-status.ts'
import type { VdocLogEntry } from '../../../shared/types.ts'
import { shellCommand, type ShellKind } from '../../../shared/shell-command.ts'
import { AlertIcon, ChevronDownIcon, ChevronRightIcon, SearchIcon } from '../icons.tsx'
import { OUTCOME_META } from '../state-meta.ts'
import { OutcomeIcon } from './StateGlyph.tsx'

interface Props {
  entries: VdocLogEntry[]
  /** Documents in the tree - turns a path argument into a link. */
  known(path: string): boolean
  /** The open document, for the "This document only" scope. */
  selection: string | null
  notify(text: string): void
  onOpenDocument(path: string): void
  /** Problems doesn't exist yet - findings are reviewed in the document's lint. */
  onReviewProblems(path: string): void
  onRerun(target: RerunTarget): void
  onClose(): void
}

type Segment = 'all' | 'findings' | 'errors'

const EDGE: Record<CliOutcome, string> = {
  success: 'var(--color-sync)',
  findings: 'var(--color-warn)',
  warning: 'var(--color-warn)',
  error: 'var(--color-conflict)',
}

const duration = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`)
const time = (at: number): string => new Date(at).toLocaleTimeString([], { hour12: false })

/** Full overlay of every CLI command this session: semantic status from the JSON, output as real text. */
export function LogsView({ entries, known, selection, notify, onOpenDocument, onReviewProblems, onRerun, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [segment, setSegment] = useState<Segment>('all')
  const [thisDoc, setThisDoc] = useState(false)
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set())
  const [clearedBefore, setClearedBefore] = useState(0)
  const [focus, setFocus] = useState(0)
  const shell: ShellKind = window.vdoc.platform === 'win32' ? 'powershell' : 'posix'

  const rows = useMemo(() => [...entries]
    .filter(entry => entry.id > clearedBefore)
    .reverse()
    .map(entry => ({ entry, status: cliStatus(entry), command: shellCommand(['vdoc', ...entry.args], shell), document: documentOf(entry.args, known) })),
  [entries, clearedBefore, known, shell])

  const counts = useMemo(() => {
    const result = { success: 0, findings: 0, warning: 0, error: 0 }
    for (const row of rows) result[row.status.outcome] += 1
    return result
  }, [rows])

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter(row => {
      if (segment === 'findings' && row.status.outcome !== 'findings' && row.status.outcome !== 'warning') return false
      if (segment === 'errors' && row.status.outcome !== 'error') return false
      if (thisDoc && (selection === null || row.document !== selection)) return false
      if (needle === '') return true
      return row.command.toLowerCase().includes(needle)
        || row.entry.stdout.toLowerCase().includes(needle)
        || row.entry.stderr.toLowerCase().includes(needle)
    })
  }, [rows, query, segment, thisDoc, selection])

  useEffect(() => setFocus(current => Math.min(current, Math.max(shown.length - 1, 0))), [shown.length])

  const copy = (text: string, what: string): void => {
    void window.vdoc.copyText(text)
      .then(() => notify(`${what} copied`))
      .catch(() => notify(`Could not copy ${what.toLowerCase()}`))
  }

  const toggle = (id: number): void => setOpenIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  // The overlay owns its keys: esc closes, ↑↓ move, ⏎ expands, ⌘C copies the selection or the focused command.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const inField = event.target instanceof HTMLInputElement
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      const mod = window.vdoc.platform === 'darwin' ? event.metaKey : event.ctrlKey
      // Inside the search field, mod+C must stay a native copy of the typed text, not the row shortcut.
      if (mod && event.key.toLowerCase() === 'c' && !inField) {
        const selected = window.getSelection()?.toString() ?? ''
        const text = selected !== '' ? selected : shown[focus]?.command
        if (!text) return
        event.preventDefault()
        event.stopPropagation()
        copy(text, selected !== '' ? 'Selection' : 'Command')
        return
      }
      if (inField) return
      if (event.key === 'ArrowDown' || event.key === 'j') setFocus(current => Math.min(current + 1, shown.length - 1))
      else if (event.key === 'ArrowUp' || event.key === 'k') setFocus(current => Math.max(current - 1, 0))
      else if (event.key === 'Enter' && shown[focus]) toggle(shown[focus].entry.id)
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const copyAll = (): void => copy(
    shown.map(row => `[${time(row.entry.at)}] ${row.status.summary}\n$ ${row.command}\n${row.entry.stdout}\n${row.entry.stderr}`.trim()).join('\n\n'),
    'All output',
  )

  const summary = [
    `${rows.length} command${rows.length === 1 ? '' : 's'} this session`,
    `${counts.success} succeeded`,
    counts.findings > 0 && `${counts.findings} returned findings`,
    counts.warning > 0 && `${counts.warning} warning${counts.warning === 1 ? '' : 's'}`,
    counts.error > 0 && `${counts.error} error${counts.error === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ')

  return (
    <div className="fixed inset-0 z-50 bg-[var(--scrim)]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        className="absolute inset-6 flex flex-col overflow-hidden rounded-xl border border-line-menu bg-pane shadow-modal"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start gap-4 border-b border-line-subtle px-[22px] pb-[14px] pt-[18px]">
          <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
            <h1 className="text-[16px] font-semibold text-ink">CLI activity</h1>
            <p className="text-[12px] text-ink-mute">{summary}</p>
          </div>
          <SecondaryButton onClick={copyAll} disabled={shown.length === 0}>Copy all</SecondaryButton>
          <SecondaryButton onClick={() => setClearedBefore(entries.at(-1)?.id ?? 0)} disabled={rows.length === 0}>Clear</SecondaryButton>
          <SecondaryButton onClick={onClose}>Close <span className="ml-1 font-mono text-[10.5px] text-ink-mute">esc</span></SecondaryButton>
        </div>

        <div className="flex items-center gap-2.5 border-b border-line-subtle px-[22px] py-3">
          <div className="field-ring flex min-w-0 flex-1 items-center gap-[9px] rounded-md border border-line bg-sidebar px-[11px] py-[6px]">
            <SearchIcon size={12} className="shrink-0 text-ink-mute" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search commands and output…"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink placeholder-ink-mute outline-none"
            />
          </div>
          <div className="flex items-center gap-[3px] rounded-md border border-line bg-sidebar p-[3px]">
            <SegmentButton active={segment === 'all'} onClick={() => setSegment('all')}>All</SegmentButton>
            <SegmentButton active={segment === 'findings'} onClick={() => setSegment('findings')}>
              <OutcomeIcon outcome="findings" size={11} />Findings {counts.findings + counts.warning}
            </SegmentButton>
            <SegmentButton active={segment === 'errors'} onClick={() => setSegment('errors')}>
              <OutcomeIcon outcome="error" size={11} />Errors {counts.error}
            </SegmentButton>
          </div>
          <button
            onClick={() => setThisDoc(value => !value)}
            disabled={!selection}
            aria-pressed={thisDoc}
            title={selection ?? 'No document open'}
            className={`whitespace-nowrap rounded-md border px-3 py-1.5 text-[12px] disabled:opacity-40 ${
              thisDoc ? 'border-control bg-selected text-ink' : 'border-line bg-raised text-ink-dim hover:bg-hover hover:text-ink'
            }`}
          >
            This document only
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {shown.length === 0
            ? <div className="flex h-full items-center justify-center text-[12px] text-ink-mute">{rows.length === 0 ? 'No commands recorded yet' : 'Nothing matches this filter'}</div>
            : shown.map((row, index) => (
                <LogRow
                  key={row.entry.id}
                  entry={row.entry}
                  status={row.status}
                  command={row.command}
                  document={row.document}
                  open={openIds.has(row.entry.id)}
                  focused={index === focus}
                  onToggle={() => {
                    setFocus(index)
                    toggle(row.entry.id)
                  }}
                  onCopy={copy}
                  onOpenDocument={onOpenDocument}
                  onReviewProblems={onReviewProblems}
                  onRerun={onRerun}
                />
              ))}
        </div>

        <div className="flex items-center gap-[14px] border-t border-line-subtle bg-chrome px-[22px] py-2.5 text-[11px] text-ink-mute">
          <span><Key>↑↓</Key> move</span>
          <span><Key>⏎</Key> expand</span>
          <span><Key>{window.vdoc.platform === 'darwin' ? '⌘C' : 'Ctrl+C'}</Key> copy selection</span>
          <span className="flex-1" />
          <span>a non-zero exit is not automatically an error - the CLI's <span className="font-mono text-ink-body">status</span> field decides the label</span>
        </div>
      </div>
    </div>
  )
}

function Key({ children }: { children: ReactNode }) {
  return <kbd className="font-mono text-ink-body">{children}</kbd>
}

function SecondaryButton({ children, onClick, disabled }: { children: ReactNode, onClick(): void, disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center whitespace-nowrap rounded-md border border-line bg-raised px-3 py-1.5 text-[12px] text-control-ink hover:bg-hover disabled:opacity-40 disabled:hover:bg-raised"
    >
      {children}
    </button>
  )
}

function SegmentButton({ active, onClick, children }: { active: boolean, onClick(): void, children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded px-3 py-1 text-[12px] ${active ? 'bg-hover font-medium text-ink' : 'text-ink-dim hover:text-ink'}`}
    >
      {children}
    </button>
  )
}

function LogRow({ entry, status, command, document, open, focused, onToggle, onCopy, onOpenDocument, onReviewProblems, onRerun }: {
  entry: VdocLogEntry
  status: CliStatus
  command: string
  document: string | null
  open: boolean
  focused: boolean
  onToggle(): void
  onCopy(text: string, what: string): void
  onOpenDocument(path: string): void
  onReviewProblems(path: string): void
  onRerun(target: RerunTarget): void
}) {
  const meta = OUTCOME_META[status.outcome]
  const rerun = rerunTarget(entry.args)
  const interpretation = interpretCli(entry, status)
  const output = [entry.stdout, entry.stderr].filter(text => text.trim() !== '').join('\n')
  return (
    <div
      data-log-row
      className={`border-b ${open ? 'border-line-subtle bg-raised-row' : focused ? 'border-row-sep bg-row-hover' : 'border-row-sep hover:bg-row-hover'}`}
      style={open ? { boxShadow: `inset 2px 0 0 ${EDGE[status.outcome]}` } : undefined}
    >
      <div
        role="button"
        tabIndex={-1}
        onClick={() => {
          // A click that ends a text selection must not collapse the row.
          if (window.getSelection()?.isCollapsed === false) return
          onToggle()
        }}
        className="grid cursor-default grid-cols-[78px_92px_1fr_84px_26px] items-center gap-[14px] px-[22px] py-[10px]"
      >
        <span className="font-mono text-[11.5px] text-ink-mute">{time(entry.at)}</span>
        <span className={`flex items-center gap-[7px] text-[11.5px] ${meta.color}`} title={status.summary}>
          <OutcomeIcon outcome={status.outcome} />{meta.label}
        </span>
        <span className={`selectable min-w-0 truncate font-mono text-[12px] ${open ? 'whitespace-normal break-all text-ink' : 'text-ink-body'}`}>{command}</span>
        <span className="text-right font-mono text-[11.5px] text-ink-mute">{duration(entry.durationMs)}</span>
        <span className="flex justify-center text-ink-mute">{open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}</span>
      </div>

      {open && (
        <div className="flex flex-col gap-[14px] px-[22px] pb-[18px] pt-1">
          <div className="flex flex-wrap gap-[26px]">
            <Meta label="Status"><span className={`selectable ${meta.color}`}>{status.summary}</span></Meta>
            <Meta label="Exit code"><span className="selectable font-mono">{entry.exitCode}</span></Meta>
            <Meta label="Duration"><span className="selectable font-mono">{duration(entry.durationMs)}</span></Meta>
            {document && (
              <Meta label="Document">
                <button onClick={() => onOpenDocument(document)} className="text-link hover:text-link-hover hover:underline">{document.split('/').at(-1)}</button>
              </Meta>
            )}
            <span className="flex-1" />
            <div className="flex items-end gap-[7px]">
              <SmallButton onClick={() => onCopy(command, 'Command')}>Copy command</SmallButton>
              <SmallButton onClick={() => onCopy(output, 'Output')} disabled={output === ''}>Copy output</SmallButton>
              {rerun && <SmallButton onClick={() => onRerun(rerun)}>Rerun</SmallButton>}
            </div>
          </div>
          <OutputBlock label="stdout" text={entry.stdout} onCopy={onCopy} />
          <OutputBlock label="stderr" text={entry.stderr} onCopy={onCopy} />
          {interpretation && (
            <div className="flex items-center gap-[11px] rounded-[7px] border border-banner-edge bg-banner-bg px-[13px] py-2.5">
              <AlertIcon size={13} className="shrink-0 text-banner-glyph" />
              <span className="flex-1 text-[12px] leading-[1.55] text-banner-ink">{interpretation}</span>
              {document && (
                <button
                  onClick={() => onReviewProblems(document)}
                  className="shrink-0 whitespace-nowrap rounded-[5px] border border-primary-edge bg-primary px-3 py-[5px] text-[11.5px] text-primary-ink hover:bg-primary-hover"
                >
                  Review in Problems
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Meta({ label, children }: { label: string, children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[10.5px] uppercase tracking-[0.9px] text-ink-mute">{label}</span>
      <span className="text-[12px] text-ink-body">{children}</span>
    </div>
  )
}

function SmallButton({ children, onClick, disabled }: { children: ReactNode, onClick(): void, disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="whitespace-nowrap rounded-[5px] border border-line bg-raised px-[11px] py-[5px] text-[11.5px] text-control-ink hover:bg-hover disabled:opacity-40 disabled:hover:bg-raised"
    >
      {children}
    </button>
  )
}

function TextButton({ children, onClick, active }: { children: ReactNode, onClick(): void, active?: boolean }) {
  return <button onClick={onClick} className={`text-[11px] hover:text-ink-body ${active ? 'text-ink-body' : 'text-ink-mute'}`}>{children}</button>
}

/** Output well: plain text lines, syntax tint by spans only, never truncated - wrap or scroll. */
function OutputBlock({ label, text, onCopy }: { label: string, text: string, onCopy(text: string, what: string): void }) {
  const [wrap, setWrap] = useState(false)
  const empty = text.trim() === ''
  const format = empty ? 'text' : detectFormat(text)
  return (
    <div className="flex flex-col gap-[7px]">
      <div className="flex items-center gap-[9px]">
        <span className="text-[10.5px] uppercase tracking-[0.9px] text-ink-mute">{label}</span>
        {!empty && <span className="font-mono text-[10.5px] text-ink-mute">{format}</span>}
        <span className="flex-1" />
        {empty
          ? <span className="text-[11px] text-ink-mute">empty</span>
          : (
              <>
                <TextButton onClick={() => onCopy(text, label)}>Copy</TextButton>
                <TextButton onClick={() => setWrap(value => !value)} active={wrap}>Wrap</TextButton>
              </>
            )}
      </div>
      {!empty && (
        <pre
          className={`selectable max-h-[420px] overflow-auto rounded-[7px] border border-line-subtle bg-well px-[15px] py-[13px] font-mono text-[11.5px] leading-[1.7] text-ink-body ${wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}
        >
          {format === 'json' ? tintJson(text) : text}
        </pre>
      )}
    </div>
  )
}

/** Keys and strings get a colour span each; the rest stays raw text so selection is exact. */
function tintJson(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern = /("(?:[^"\\]|\\.)*")(\s*:)?/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(<span key={match.index} className={match[2] ? 'text-json-key' : 'text-json-string'}>{match[1]}</span>)
    if (match[2]) parts.push(match[2])
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}
