import { useCallback, useEffect, useRef, useState } from 'react'

import type { DiffResult } from '../../../shared/types.ts'
import { displayState, type FileEntry } from '../../../shared/status.ts'
import { shortcutLabel, type ViewMode } from '../commands.ts'
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
  connected: boolean
  /** The active tab — owned by App so the ⌘1–4 commands can drive it. */
  view: ViewMode
  /** Bumped by the Reload-from-disk command to re-read the file. */
  reloadKey: number
  onView(view: ViewMode): void
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

export function DetailPane(props: Props) {
  const { entry, view, onError } = props
  const [content, setContent] = useState<string | null>(null)
  const [readFailed, setReadFailed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const actionsRef = useRef<HTMLButtonElement>(null)

  const path = entry.path

  // In-app editing: `content` is the draft, `diskRef` the disk truth for the file
  // it names (last read or successful write). A debounced flush writes the draft,
  // guarded by a re-read so an edit made outside the app is never clobbered.
  const diskRef = useRef<{ path: string, text: string } | null>(null)
  const pendingRef = useRef<{ path: string, text: string } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const flush = useCallback(() => {
    clearTimeout(timerRef.current)
    const pending = pendingRef.current
    pendingRef.current = null
    if (!pending) return
    const disk = diskRef.current
    const expected = disk?.path === pending.path ? disk.text : null
    if (expected === pending.text) return
    void window.vdoc.readFile(pending.path)
      .then(onDisk => {
        if (expected === null || onDisk !== expected) {
          throw new Error(`${pending.path.split('/').at(-1)} changed on disk while editing — draft not saved. Reload from disk (⌘⌥R) and redo the edit.`)
        }
        return window.vdoc.writeFile(pending.path, pending.text).then(() => {
          if (diskRef.current?.path === pending.path) diskRef.current = pending
        })
      })
      .catch(onError)
  }, [onError])

  const handleEdit = useCallback((text: string) => {
    setContent(text)
    pendingRef.current = { path, text }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, 800)
  }, [flush, path])

  // Flush the draft before switching files and on unmount.
  useEffect(() => flush, [path, flush])

  useEffect(() => {
    // Reload (⌘⌥R) is an explicit "take the disk version": drop any pending draft.
    pendingRef.current = null
    clearTimeout(timerRef.current)
    setContent(null)
    setReadFailed(false)
    setMenuOpen(false)
    let live = true
    window.vdoc.readFile(path)
      .then(text => {
        if (!live) return
        diskRef.current = { path, text }
        setContent(text)
      })
      .catch(() => {
        if (!live) return
        setReadFailed(true)
        setContent('Could not read this file.')
      })
    return () => {
      live = false
    }
  }, [path, props.reloadKey])

  // Disk changed under us (external editor, pull, own save echo): refresh the
  // buffer when there is no active draft to protect.
  useEffect(() => window.vdoc.onFilesChanged(changed => {
    if (!changed.includes(path) || pendingRef.current) return
    void window.vdoc.readFile(path).then(text => {
      if (pendingRef.current || diskRef.current?.path !== path || text === diskRef.current.text) return
      diskRef.current = { path, text }
      setContent(text)
    }).catch(() => undefined)
  }), [path])

  // A loaded diff for this file (via the Diff tab or ⏎ in the tree) takes the stage.
  const diffReady = props.diff?.path === path
  const { onView } = props
  useEffect(() => {
    if (diffReady) onView('diff')
  }, [diffReady, onView])

  const state = displayState(entry)
  const meta = STATE_META[state]
  const check = entry.check
  const busy = props.busyOp !== null
  const loadingDiff = props.diffLoading === path
  const pushMode = pushModeFor(state)
  const canPull = entry.tracked && state !== 'untracked' && state !== 'not-found'
  const showDiff = view === 'diff' && diffReady && props.diff
  const segments = path.split('/')
  const name = segments.at(-1) ?? path
  const parentDir = segments.at(-2)

  const openDiffTab = (): void => (diffReady ? onView('diff') : props.onDiff(path))

  // The single filled button is derived from state; everything else lives in the menu.
  const primary = !entry.tracked
    ? { label: 'Create', run: () => props.onCreate(path) }
    : state === 'behind'
      ? { label: 'Pull', run: () => props.onPull(path) }
      : state === 'ahead' || state === 'local-edits' || state === 'no-version'
        ? { label: 'Push', run: () => props.onPush(path, false) }
        : state === 'conflict'
          ? { label: 'Diff', run: openDiffTab }
          : state === 'unverified'
            ? { label: 'Verify', run: () => props.onMarkVerified(path) }
            : { label: 'Check', run: () => props.onCheck(path) }

  const notes: Array<{ text: string, error: boolean }> = []
  if (meta.hint && (state === 'unverified' || state === 'no-version' || state === 'conflict' || state === 'not-found')) {
    notes.push({ text: meta.hint, error: state === 'conflict' || state === 'not-found' })
  }
  if (check?.titleMismatch) {
    notes.push({ text: 'Frontmatter title differs from the body H1 — pushes use the frontmatter title.', error: false })
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-pane">
      <div className="flex items-center gap-4 px-[18px] pb-[13px] pt-3.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {parentDir && (
            <span title={path} className="whitespace-nowrap text-[12px] text-ink-faint">{parentDir} /</span>
          )}
          <h1 title={path} className="truncate text-[15px] font-medium text-ink">{name}</h1>
          <div className="flex shrink-0 gap-0.5">
            <IconButton title={`Open in editor — ${shortcutLabel('file.editor')}`} onClick={() => props.onOpenEditor(path)}>✎</IconButton>
            <IconButton title={`Reveal in Finder — ${shortcutLabel('file.finder')}`} onClick={() => props.onRevealFinder(path)}>⊞</IconButton>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className={`flex items-center gap-[7px] whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] ${meta.chip}`}>
            <span className={`h-[7px] w-[7px] rounded-full bg-current ${busy ? 'animate-pulse' : ''}`} />
            <span>{meta.label}</span>
          </div>

          {check && (check.localVersion !== undefined || check.remoteVersion !== undefined) && (
            <div className="flex items-center gap-2 whitespace-nowrap rounded-full border border-control bg-raised px-[11px] py-1 text-[12px]">
              <span className="hidden text-ink-label @min-[1080px]:inline">local</span>
              <span className="text-ink-body">v{check.localVersion ?? '—'}</span>
              <span className="text-glyph">{relationGlyph(state)}</span>
              <span className="hidden text-ink-label @min-[1080px]:inline">remote</span>
              <span className="text-ink-body">v{check.remoteVersion ?? '—'}</span>
            </div>
          )}

          {entry.gitDirty && (
            <div
              title="Git: uncommitted local changes"
              className="hidden items-center rounded-full border border-control bg-raised px-2.5 py-1 text-[12px] text-warn-text @min-[1000px]:flex"
            >
              ±
            </div>
          )}

          {check?.pageId && (
            <button
              onClick={() => props.onOpenConfluence(path)}
              title={`Open Confluence page ${check.pageId}`}
              className="group flex items-center gap-[7px] whitespace-nowrap rounded-full border border-control bg-raised px-[11px] py-1 text-[12px]"
            >
              <span className="text-ink-label">page</span>
              <span className="text-accent group-hover:underline">{check.pageId}</span>
              <span className="text-[10px] text-ink-ghost">↗</span>
            </button>
          )}

          <div className="mx-0.5 h-[22px] w-px bg-line" />

          <button
            onClick={primary.run}
            disabled={busy || !props.connected}
            className="flex items-center gap-2 whitespace-nowrap rounded-md border border-primary-edge bg-primary px-4 py-1.5 text-[12.5px] text-primary-ink hover:bg-primary-hover disabled:opacity-40"
          >
            {primary.label}
            {busy && <span className="h-3 w-3 animate-spin rounded-full border border-primary-ink/60 border-t-transparent" />}
          </button>

          <div className="relative">
            <button
              ref={actionsRef}
              onClick={() => setMenuOpen(open => !open)}
              className="whitespace-nowrap rounded-md border border-control bg-raised px-3 py-1.5 text-[12.5px] text-ink-body hover:bg-hover"
            >
              Actions ▾
            </button>
            {menuOpen && (
              <ActionsMenu
                entry={entry}
                primaryLabel={primary.label}
                canPull={canPull}
                pushMode={pushMode}
                busy={busy}
                connected={props.connected}
                onClose={() => {
                  setMenuOpen(false)
                  actionsRef.current?.focus()
                }}
                onPull={() => props.onPull(path)}
                onPush={force => props.onPush(path, force)}
                onSync={() => props.onSync(path)}
                onCreate={() => props.onCreate(path)}
                onOpenConfluence={() => props.onOpenConfluence(path)}
              />
            )}
          </div>
        </div>
      </div>

      {notes.map(note => (
        <div
          key={note.text}
          className={`mx-[18px] mb-3.5 flex items-center gap-[9px] rounded-[5px] border px-3 py-[9px] ${
            note.error ? 'border-bad-edge bg-bad-bg' : 'border-banner-edge bg-banner-bg'
          }`}
        >
          <span className={`text-[12px] ${note.error ? 'text-conflict' : 'text-banner-glyph'}`}>⚠</span>
          <span className={`flex-1 text-[12px] leading-relaxed ${note.error ? 'text-bad-ink' : 'text-banner-ink'}`}>
            {note.text}
          </span>
        </div>
      ))}

      <div className="flex items-center gap-1 border-b border-line px-[18px]">
        <Tab label="Content" active={view === 'content' || (view === 'diff' && !showDiff)} onClick={() => onView('content')} />
        <Tab label="Preview" active={view === 'preview'} disabled={content === null} onClick={() => onView('preview')} />
        <Tab
          label={loadingDiff ? 'Diff…' : 'Diff'}
          active={Boolean(showDiff)}
          disabled={!entry.tracked || loadingDiff}
          onClick={openDiffTab}
        />
        <Tab label="Comments" active={view === 'comments'} disabled={!entry.tracked} onClick={() => onView('comments')} />
        <div className="flex-1" />
        <button
          onClick={() => props.onLint(path)}
          disabled={busy}
          className="px-3 py-2 text-[12px] text-ink-label hover:text-ink disabled:opacity-40"
        >
          Lint
        </button>
      </div>

      <div className="min-h-0 flex-1 bg-content">
        {view === 'comments'
          ? <CommentsView path={path} onError={props.onError} />
          : view === 'preview' && content !== null
            ? <PreviewView content={content} theme={props.theme} />
            : showDiff && props.diff
          ? (
              props.diff.result.identical
                ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3">
                      <p className="text-[12px] text-sync-text">No content differences with Confluence</p>
                      {state === 'unverified' && !props.diff.result.versionDrift && (
                        <button
                          onClick={() => props.onMarkVerified(path)}
                          disabled={busy}
                          className="rounded-md border border-ok-edge px-3 py-1.5 text-[12px] text-sync-text hover:bg-ok-bg disabled:opacity-40"
                          title="Content is identical — record the local-edit baseline so this file shows Synced"
                        >
                          Verify
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
            : <CodeView content={content} onChange={readFailed ? undefined : handleEdit} onSave={flush} />}
      </div>
    </div>
  )
}

/** = equal · → local behind remote · ← local ahead · ≠ diverged. */
function relationGlyph(state: ReturnType<typeof displayState>): string {
  if (state === 'behind') return '→'
  if (state === 'ahead' || state === 'local-edits') return '←'
  if (state === 'conflict') return '≠'
  return '='
}

function ActionsMenu({ entry, primaryLabel, canPull, pushMode, busy, connected, onClose, onPull, onPush, onSync, onCreate, onOpenConfluence }: {
  entry: FileEntry
  primaryLabel: string
  canPull: boolean
  pushMode: PushMode
  busy: boolean
  connected: boolean
  onClose(): void
  onPull(): void
  onPush(force: boolean): void
  onSync(): void
  onCreate(): void
  onOpenConfluence(): void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      if (items.length === 0) return
      const index = items.findIndex(item => item === document.activeElement)
      const next = event.key === 'ArrowDown'
        ? items[(index + 1) % items.length]
        : items[(index - 1 + items.length) % items.length]
      next.focus()
    }
    const onClick = (event: MouseEvent): void => {
      // The wrapper also holds the Actions button — its own onClick handles the toggle.
      if (!menuRef.current?.parentElement?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onClick)
    }
  }, [onClose])

  const check = entry.check
  const confluenceOff = busy || !connected
  const item = (action: () => void) => (): void => {
    onClose()
    action()
  }

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full z-30 mt-1 w-[232px] rounded-lg border border-line-menu bg-overlay p-1.5 shadow-menu"
    >
      <div className="px-2.5 pb-1 pt-[7px] text-[10.5px] tracking-[0.12em] text-ink-ghost">CONFLUENCE</div>
      {primaryLabel !== 'Pull' && (
        <ActionItem
          label={`Pull remote${check?.remoteVersion ? ` v${check.remoteVersion}` : ''}`}
          shortcut={shortcutLabel('sync.pull')}
          disabled={!canPull || confluenceOff}
          onClick={item(onPull)}
        />
      )}
      {primaryLabel !== 'Push' && (
        <ActionItem
          label={`Push local${check?.localVersion ? ` v${check.localVersion}` : ''}`}
          shortcut={shortcutLabel('sync.push')}
          disabled={pushMode === 'disabled' || confluenceOff}
          onClick={item(() => onPush(pushMode === 'force'))}
        />
      )}
      <ActionItem
        label="Find matching page"
        disabled={entry.tracked || confluenceOff}
        reason={entry.tracked ? 'already linked' : undefined}
        onClick={item(onSync)}
      />
      {primaryLabel !== 'Create' && (
        <ActionItem
          label="Create page"
          disabled={entry.tracked || busy}
          reason={entry.tracked ? 'page exists' : undefined}
          onClick={item(onCreate)}
        />
      )}
      {entry.tracked && (
        <>
          <div className="mx-2 my-[5px] h-px bg-line" />
          <div className="px-2.5 pb-1 pt-[7px] text-[10.5px] tracking-[0.12em] text-ink-ghost">OPEN</div>
          <ActionItem label="Confluence page ↗" onClick={item(onOpenConfluence)} />
        </>
      )}
    </div>
  )
}

function ActionItem({ label, shortcut, reason, disabled, onClick }: {
  label: string
  shortcut?: string
  reason?: string
  disabled?: boolean
  onClick(): void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-[12.5px] text-ink-body hover:bg-selected disabled:text-ink-ghost disabled:hover:bg-transparent"
    >
      <span className="truncate">{label}</span>
      {reason
        ? <span className="shrink-0 text-[10.5px] text-ink-ghost">{reason}</span>
        : shortcut && <span className="shrink-0 text-[11px] text-ink-ghost">{shortcut}</span>}
    </button>
  )
}

function IconButton({ title, onClick, children }: { title: string, onClick(): void, children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-[5px] text-[12.5px] text-ink-ghost hover:bg-hover hover:text-ink"
    >
      {children}
    </button>
  )
}

function Tab({ label, active, disabled, onClick }: { label: string, active: boolean, disabled?: boolean, onClick(): void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`whitespace-nowrap border-b-2 px-3 py-2 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'border-accent text-ink' : 'border-transparent text-ink-dim hover:text-ink'
      }`}
    >
      {label}
    </button>
  )
}

function CenterNote({ text, tone }: { text: string, tone: string }) {
  return <div className={`flex h-full items-center justify-center text-[12px] ${tone}`}>{text}</div>
}
