import { useEffect, useState } from 'react'

import type { DiffResult } from '../../../shared/types.ts'
import { displayState, type FileEntry } from '../../../shared/status.ts'
import { STATE_META } from '../state-meta.ts'
import { CodeView } from './CodeView.tsx'
import { CommentsView } from './CommentsView.tsx'
import { DiffView } from './DiffView.tsx'
import { PreviewView } from './PreviewView.tsx'

interface Props {
  entry: FileEntry
  diff: { path: string, result: DiffResult } | null
  diffLoading: string | null
  busyOp: string | null
  theme: 'dark' | 'light'
  onError(error: unknown): void
  onDiff(path: string): void
  onCheck(path: string): void
  onMarkVerified(path: string): void
  onPull(path: string): void
  onPush(path: string, force: boolean): void
  onLint(path: string): void
  onSync(path: string): void
  onCreate(path: string): void
  onOpenConfluence(path: string): void
  onOpenEditor(path: string): void
  onRevealFinder(path: string): void
}

type PushMode = 'normal' | 'force' | 'disabled'

/** Push is normal when local is the newer side, force when Confluence moved, off otherwise. */
function pushModeFor(state: ReturnType<typeof displayState>): PushMode {
  if (state === 'ahead' || state === 'local-edits' || state === 'no-version' || state === 'unverified') return 'normal'
  if (state === 'behind' || state === 'conflict') return 'force'
  return 'disabled'
}

type ViewMode = 'content' | 'preview' | 'diff' | 'comments'

export function DetailPane(props: Props) {
  const { entry } = props
  const [view, setView] = useState<ViewMode>('content')
  const [content, setContent] = useState<string | null>(null)

  const path = entry.path

  useEffect(() => {
    setView('content')
    setContent(null)
    let live = true
    window.vdoc.readFile(path)
      .then(text => live && setContent(text))
      .catch(() => live && setContent('Could not read this file.'))
    return () => {
      live = false
    }
  }, [path])

  // A loaded diff for this file (via the Diff tab or ⏎ in the tree) takes the stage.
  const diffReady = props.diff?.path === path
  useEffect(() => {
    if (diffReady) setView('diff')
  }, [diffReady])

  const state = displayState(entry)
  const meta = STATE_META[state]
  const check = entry.check
  const busy = props.busyOp !== null
  const loadingDiff = props.diffLoading === path
  const pushMode = pushModeFor(state)
  const canPull = entry.tracked && state !== 'untracked' && state !== 'not-found'
  const showDiff = view === 'diff' && diffReady && props.diff

  return (
    <div className="flex h-full min-w-0 flex-col">
      <header className="border-b border-line px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="truncate font-mono text-[14px] text-ink">{path.split('/').at(-1)}</h1>
          <span className={`flex items-center gap-1 font-mono text-[12px] ${meta.color}`}>
            {meta.glyph} {meta.label}
          </span>
          {check && (check.localVersion !== undefined || check.remoteVersion !== undefined) && (
            <span className="font-mono text-[12px] text-ink-dim">
              local v{check.localVersion ?? '—'} → remote v{check.remoteVersion ?? '—'}
            </span>
          )}
          {entry.gitDirty && (
            <span className="font-mono text-[11px] text-ink-faint" title="This file has uncommitted git changes">
              ± uncommitted
            </span>
          )}
        </div>
        <button
          onClick={() => void navigator.clipboard.writeText(path)}
          title="Copy relative path"
          className="mt-0.5 block max-w-full truncate font-mono text-[11px] text-ink-faint hover:text-ink-dim"
        >
          {path}
        </button>
        {meta.hint && <p className="mt-1 text-[11px] text-ink-dim">{meta.hint}</p>}
        {check?.titleMismatch && (
          <p className="mt-1 text-[11px] text-ahead">Frontmatter title differs from the body H1 — pushes use the frontmatter title.</p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <div className="flex overflow-hidden rounded-md border border-line">
            <ViewTab label="Content" active={view === 'content' || (view === 'diff' && !showDiff)} onClick={() => setView('content')} />
            <ViewTab label="Preview" active={view === 'preview'} disabled={content === null} onClick={() => setView('preview')} />
            <ViewTab
              label={loadingDiff ? 'Diff…' : 'Diff'}
              active={Boolean(showDiff)}
              disabled={!entry.tracked || loadingDiff}
              onClick={() => (diffReady ? setView('diff') : props.onDiff(path))}
            />
            <ViewTab label="Comments" active={view === 'comments'} disabled={!entry.tracked} onClick={() => setView('comments')} />
          </div>
          <span className="mx-1 w-px self-stretch bg-line" />
          <Action label="Check" disabled={!entry.tracked || busy} onClick={() => props.onCheck(path)} />
          <Action label="Pull" disabled={!canPull || busy} onClick={() => props.onPull(path)} />
          <Action
            label="Push"
            disabled={pushMode === 'disabled' || busy}
            force={pushMode === 'force'}
            title={pushMode === 'force' ? 'Confluence moved since the last pull — pushing will force-overwrite the remote edits' : undefined}
            onClick={() => props.onPush(path, pushMode === 'force')}
          />
          <Action label="Lint" disabled={busy} onClick={() => props.onLint(path)} />
          <span className="mx-1 w-px self-stretch bg-line" />
          <Action label="Confluence" disabled={!entry.tracked} onClick={() => props.onOpenConfluence(path)} />
          <Action label="Editor" onClick={() => props.onOpenEditor(path)} />
          <Action label="Finder" onClick={() => props.onRevealFinder(path)} />
          <span className="ml-auto" />
          <Action
            label="Sync"
            disabled={entry.tracked || busy}
            title="Link this file to an existing Confluence page by exact title match"
            onClick={() => props.onSync(path)}
          />
          <Action
            label="Create"
            disabled={entry.tracked || busy}
            title="Create a new Confluence page from this file"
            onClick={() => props.onCreate(path)}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {view === 'comments'
          ? <CommentsView path={path} onError={props.onError} />
          : view === 'preview' && content !== null
            ? <PreviewView content={content} theme={props.theme} />
            : showDiff && props.diff
          ? (
              props.diff.result.identical
                ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3">
                      <p className="text-[12px] text-sync">No content differences with Confluence</p>
                      {state === 'unverified' && !props.diff.result.versionDrift && (
                        <button
                          onClick={() => props.onMarkVerified(path)}
                          disabled={busy}
                          className="rounded-md border border-sync/50 px-3 py-1.5 text-[12px] text-sync hover:bg-sync/10 disabled:opacity-40"
                          title="Record the local-edit baseline so this file shows In sync"
                        >
                          Mark verified
                        </button>
                      )}
                    </div>
                  )
                : (
                    <div className="flex h-full flex-col">
                      <div className="flex border-b border-line font-mono text-[11px] text-ink-dim">
                        <span className="flex-1 px-4 py-1.5">Confluence — v{props.diff.result.remoteVersion}</span>
                        <span className="flex-1 border-l border-line px-4 py-1.5">Local — v{props.diff.result.localVersion ?? '—'}</span>
                      </div>
                      <div className="min-h-0 flex-1">
                        <DiffView remote={props.diff.result.remote} local={props.diff.result.local} />
                      </div>
                    </div>
                  )
            )
          : content === null
            ? <CenterNote text="Loading…" tone="text-ink-faint" />
            : <CodeView content={content} />}
      </div>
    </div>
  )
}

function ViewTab({ label, active, disabled, onClick }: { label: string, active: boolean, disabled?: boolean, onClick(): void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2.5 py-1 text-[12px] disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-raised text-ink' : 'bg-panel text-ink-dim hover:text-ink'
      }`}
    >
      {label}
    </button>
  )
}

function Action({ label, onClick, disabled, title, force }: {
  label: string
  onClick(): void
  disabled?: boolean
  title?: string
  force?: boolean
}) {
  const tone = force
    ? 'border-ahead/50 bg-panel text-ahead hover:bg-ahead/10'
    : 'border-line bg-panel text-ink hover:bg-raised'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-md border px-2.5 py-1 text-[12px] disabled:cursor-not-allowed disabled:opacity-40 ${tone}`}
    >
      {label}
    </button>
  )
}

function CenterNote({ text, tone }: { text: string, tone: string }) {
  return <div className={`flex h-full items-center justify-center text-[12px] ${tone}`}>{text}</div>
}
