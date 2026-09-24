import { useEffect, useMemo, useState } from 'react'

import { diffLines, hunksOf, mergeSegments, type Hunk, type HunkChoice } from '../../../shared/line-diff.ts'
import { displayTitle, type FileEntry } from '../../../shared/status.ts'
import { timeAgo } from '../../../shared/time.ts'
import type { DiffResult, VersionEntry } from '../../../shared/types.ts'
import { IS_MAC } from '../commands.ts'
import { StateGlyph } from './StateGlyph.tsx'

interface Props {
  entry: FileEntry
  diff: DiffResult | null
  author: VersionEntry | null | undefined
  busy: boolean
  onBack(): void
  onError(error: unknown): void
  /** Writes the merged text (guarded) and previews the push. */
  onMergeAndPush(expected: string, merged: string): void
}

const CHOICE_LABEL: Record<HunkChoice, string> = { mine: 'keeping mine', theirs: 'keeping theirs', both: 'keeping both' }

/** Per-hunk conflict resolution - every hunk must be decided before the merge enables. */
export function ConflictView({ entry, diff, author, busy, onBack, onError, onMergeAndPush }: Props) {
  const segments = useMemo(() => (diff ? diffLines(diff.local, diff.remote) : []), [diff])
  const hunks = useMemo(() => hunksOf(segments), [segments])
  const [choices, setChoices] = useState<Map<number, HunkChoice>>(() => new Map())
  const [focus, setFocus] = useState(0)

  useEffect(() => setChoices(new Map()), [diff])

  const resolved = hunks.filter(hunk => choices.has(hunk.index)).length
  const left = hunks.length - resolved
  const complete = hunks.length > 0 && left === 0

  const decide = (index: number, choice: HunkChoice): void => setChoices(prev => new Map(prev).set(index, choice))
  const undo = (index: number): void => setChoices(prev => {
    const next = new Map(prev)
    next.delete(index)
    return next
  })
  const decideAll = (choice: HunkChoice): void => setChoices(new Map(hunks.map(hunk => [hunk.index, choice])))

  const merge = (): void => {
    if (!diff || !complete) return
    const merged = mergeSegments(segments, choices)
    // The CLI's diff text may be a normalized view of the file; write only when it maps back exactly.
    void window.vdoc.readFile(entry.path).then(disk => {
      if (disk === diff.local) return onMergeAndPush(disk, merged)
      const at = disk.indexOf(diff.local)
      if (at === -1 || disk.indexOf(diff.local, at + 1) !== -1) {
        throw new Error('The diff does not map back to the file on disk - reload the document and resolve again, or merge in the editor.')
      }
      onMergeAndPush(disk, disk.slice(0, at) + merged + disk.slice(at + diff.local.length))
    }).catch(onError)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const mod = IS_MAC ? event.metaKey : event.ctrlKey
      const current = hunks[focus]
      if (event.key === 'Escape') onBack()
      else if (event.key === 'ArrowDown' || event.key === 'j') setFocus(value => Math.min(value + 1, hunks.length - 1))
      else if (event.key === 'ArrowUp' || event.key === 'k') setFocus(value => Math.max(value - 1, 0))
      else if (event.key === 'ArrowLeft' && current) decide(current.index, 'mine')
      else if (event.key === 'ArrowRight' && current) decide(current.index, 'theirs')
      else if (event.key === 'b' && current) decide(current.index, 'both')
      else if (event.key === 'Enter' && mod && complete) merge()
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.querySelector(`[data-hunk="${focus}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [focus])

  return (
    <div className="flex h-full min-w-0 flex-col bg-pane">
      <div className="flex flex-col gap-[14px] px-[30px] pt-[18px]">
        <button onClick={onBack} className="self-start text-[12px] text-ink-mute hover:text-ink">‹ Changes</button>
        <div className="flex items-start gap-5">
          <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
            <h1 className="truncate text-[20px] font-semibold tracking-[-0.2px] text-ink">{displayTitle(entry)}</h1>
            <div className="flex flex-wrap items-center gap-[11px] text-[12.5px]">
              <StateGlyph group="conflict" word />
              <span className="text-sep">·</span>
              <span className="text-ink-dim">Local v{diff?.localVersion ?? entry.check?.localVersion ?? '-'} · Confluence v{diff?.remoteVersion ?? entry.check?.remoteVersion ?? '-'}</span>
              <span className="text-sep">·</span>
              <span className="text-ink-label">{hunks.length} hunk{hunks.length === 1 ? '' : 's'} · {resolved} resolved</span>
            </div>
            <span className="truncate font-mono text-[11px] text-ink-label">{entry.path}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Secondary onClick={() => decideAll('mine')} disabled={hunks.length === 0}>Keep all mine</Secondary>
            <Secondary onClick={() => decideAll('theirs')} disabled={hunks.length === 0}>Keep all theirs</Secondary>
            <button
              onClick={merge}
              disabled={!complete || busy}
              title={complete ? `Write the merged document and push - ${IS_MAC ? '⌘⏎' : 'Ctrl+⏎'}` : `Resolve the remaining ${left} hunk${left === 1 ? '' : 's'} first`}
              className="whitespace-nowrap rounded-md border border-primary-edge bg-primary px-[15px] py-[6px] text-[12px] font-medium text-primary-ink hover:bg-primary-hover disabled:border-control disabled:bg-raised disabled:text-ink-mute"
            >
              Merge & push{left > 0 && ` · ${left} left`}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-[14px] flex border-b border-t border-line-subtle text-[10.5px] uppercase tracking-[0.09em] text-ink-label">
        <span className="flex-1 px-[30px] py-2">
          Local <span className="font-mono normal-case tracking-normal text-ink-mute">- v{diff?.localVersion ?? '-'}</span>
        </span>
        <span className="flex-1 border-l border-line-subtle px-4 py-2">
          Confluence <span className="font-mono normal-case tracking-normal text-ink-mute">- v{diff?.remoteVersion ?? '-'}</span>
          {author && <span className="normal-case tracking-normal text-ink-mute"> · updated {timeAgo(author.createdAt)} by {author.author}</span>}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!diff && <p className="px-[30px] py-8 text-[12px] text-ink-label">Loading the diff…</p>}
        {diff && hunks.length === 0 && <p className="px-[30px] py-8 text-[12px] text-ink-mute">No line differences between the two versions - Recheck the document.</p>}
        {hunks.map(hunk => (
          <HunkBand
            key={hunk.index}
            hunk={hunk}
            choice={choices.get(hunk.index)}
            focused={focus === hunk.index}
            onFocus={() => setFocus(hunk.index)}
            onDecide={choice => decide(hunk.index, choice)}
            onUndo={() => undo(hunk.index)}
          />
        ))}
      </div>

      <div className="flex items-center gap-4 border-t border-line bg-chrome px-[30px] py-2 text-[11px] text-ink-mute">
        <span>↑↓ / J K move</span>
        <span>← keep mine</span>
        <span>→ keep theirs</span>
        <span>B keep both</span>
        <span>{IS_MAC ? '⌘⏎' : 'Ctrl+⏎'} merge when complete</span>
      </div>
    </div>
  )
}

function Secondary({ children, onClick, disabled }: { children: React.ReactNode, onClick(): void, disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="whitespace-nowrap rounded-md border border-control bg-raised px-3 py-[6px] text-[12px] text-ink-body hover:bg-hover disabled:opacity-40">
      {children}
    </button>
  )
}

function HunkBand({ hunk, choice, focused, onFocus, onDecide, onUndo }: {
  hunk: Hunk
  choice: HunkChoice | undefined
  focused: boolean
  onFocus(): void
  onDecide(choice: HunkChoice): void
  onUndo(): void
}) {
  const range = hunk.localEnd >= hunk.localStart ? `lines ${hunk.localStart}–${hunk.localEnd}` : `after line ${hunk.localStart - 1}`
  return (
    <section data-hunk={hunk.index} onClick={onFocus} className={`border-b border-line-subtle ${focused ? 'bg-raised-row/40' : ''}`}>
      <div
        className="flex items-center gap-3 bg-raised-row px-[30px] py-2"
        style={{ boxShadow: choice ? undefined : 'inset 2px 0 0 var(--color-conflict)' }}
      >
        <span className="font-mono text-[11px] text-ink-body">Hunk {hunk.index + 1} · {range}</span>
        {choice
          ? (
              <>
                <span className="text-[11.5px] text-sync-text">✓ {CHOICE_LABEL[choice]}</span>
                <span className="flex-1" />
                <button onClick={onUndo} className="text-[11.5px] text-accent hover:underline">Change</button>
              </>
            )
          : (
              <>
                <span className="text-[11.5px] text-conflict">unresolved</span>
                <span className="flex-1" />
                <Choice onClick={() => onDecide('mine')}>Keep mine</Choice>
                <Choice onClick={() => onDecide('theirs')}>Keep theirs</Choice>
                <Choice quiet onClick={() => onDecide('both')}>Keep both</Choice>
              </>
            )}
      </div>
      {!choice && (
        <div className="flex">
          <Side lines={hunk.local} before={hunk.before} after={hunk.after} tone="bg-diff-add" className="pl-[30px] pr-4" />
          <div className="w-px shrink-0 bg-line-subtle" />
          <Side lines={hunk.remote} before={hunk.before} after={hunk.after} tone="bg-diff-remove" className="px-4" />
        </div>
      )}
    </section>
  )
}

function Choice({ children, quiet, onClick }: { children: React.ReactNode, quiet?: boolean, onClick(): void }) {
  return (
    <button
      onClick={event => {
        event.stopPropagation()
        onClick()
      }}
      className={`whitespace-nowrap rounded-md border px-2.5 py-[3px] text-[11.5px] ${quiet ? 'border-transparent text-ink-mute hover:bg-hover hover:text-ink' : 'border-control bg-raised text-ink-body hover:bg-hover'}`}
    >
      {children}
    </button>
  )
}

function Side({ lines, before, after, tone, className }: { lines: string[], before: string[], after: string[], tone: string, className: string }) {
  return (
    <pre className={`selectable min-w-0 flex-1 overflow-x-auto py-2 font-mono text-[12px] leading-[1.7] ${className}`}>
      {before.map((line, index) => <div key={`b${index}`} className="text-ink-mute">{line || ' '}</div>)}
      {lines.map((line, index) => <div key={index} className={`rounded-[3px] px-1 text-ink ${tone}`}>{line || ' '}</div>)}
      {after.map((line, index) => <div key={`a${index}`} className="text-ink-mute">{line || ' '}</div>)}
    </pre>
  )
}
