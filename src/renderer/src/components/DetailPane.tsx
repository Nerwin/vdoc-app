import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'

import type { DiffResult } from '../../../shared/types.ts'
import { resolveRelative } from '../../../shared/links.ts'
import { GuardedSaveQueue } from '../../../shared/save-queue.ts'
import { displayState, type FileEntry } from '../../../shared/status.ts'
import { shortcutLabel, type ViewMode } from '../commands.ts'
import { STATE_META } from '../state-meta.ts'
import { CommentsView } from './CommentsView.tsx'
import { PreviewView } from './PreviewView.tsx'

const CodeView = lazy(() => import('./CodeView.tsx').then(module => ({ default: module.CodeView })))
const DiffView = lazy(() => import('./DiffView.tsx').then(module => ({ default: module.DiffView })))

interface Props {
  entry: FileEntry
  diff: { path: string, result: DiffResult } | null
  diffLoading: string | null
  busyOp: string | null
  theme: 'dark' | 'light'
  connected: boolean
  allowLossyPush: boolean
  /** The active tab - owned by App so the ⌘1–4 commands can drive it. */
  view: ViewMode
  /** Bumped by the Reload-from-disk command to re-read the file. */
  reloadKey: number
  /** Bumped by ⌘F - opens (or refocuses) the preview's find bar. */
  findSeq: number
  onView(view: ViewMode): void
  onError(error: unknown): void
  onRegisterFlush(flush: (() => Promise<boolean>) | null): void
  /** Open the sync-concepts help modal (the state banners link to it). */
  onHelp(): void
  /** Navigate to another file in the tree (backlink row, local link in the preview). */
  onSelect(path: string): void
  onDiff(path: string): void
  onCheck(path: string): void
  onMarkVerified(path: string): void
  onPull(path: string): void
  /** Opens the red confirm - pull that overwrites local content. */
  onForcePull(path: string): void
  onPush(path: string, force: boolean, allowLossy?: boolean): void
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
  const [editorLoaded, setEditorLoaded] = useState(false)
  const [saveState, setSaveState] = useState<'saved' | 'unsaved' | 'saving' | 'blocked'>('saved')
  const actionsRef = useRef<HTMLButtonElement>(null)

  const path = entry.path

  useEffect(() => {
    if (view === 'content' || view === 'split') setEditorLoaded(true)
  }, [view])

  const saveQueueRef = useRef<GuardedSaveQueue | null>(null)
  if (!saveQueueRef.current) saveQueueRef.current = new GuardedSaveQueue(request => window.vdoc.writeFile(request))
  const saveQueue = saveQueueRef.current
  const activePathRef = useRef(path)
  const loadedRef = useRef({ path, reloadKey: props.reloadKey })
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  activePathRef.current = path

  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timerRef.current)
    if (activePathRef.current === path && (saveQueue.hasPending(path) || saveQueue.isSaving(path))) {
      setSaveState('saving')
    }
    const result = await saveQueue.flush()
    for (const failure of result.failures) onError(failure.error)
    if (activePathRef.current === path) setSaveState(saveQueue.hasPending(path) ? 'blocked' : 'saved')
    return result.saved
  }, [onError, path, saveQueue])

  const handleEdit = useCallback((text: string) => {
    setContent(text)
    try {
      saveQueue.queue(path, text)
      setSaveState('unsaved')
    } catch (error) {
      setSaveState('blocked')
      onError(error)
      return
    }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void flush(), 800)
  }, [flush, onError, path, saveQueue])

  // Flush the draft before switching files and on unmount.
  useEffect(() => () => {
    void flush()
  }, [path, flush])

  useEffect(() => {
    props.onRegisterFlush(flush)
    return () => props.onRegisterFlush(null)
  }, [flush, props.onRegisterFlush])

  useEffect(() => {
    // Reload (⌘⌥R) is an explicit "take the disk version": drop any pending draft.
    const previous = loadedRef.current
    const explicitReload = previous.path === path && previous.reloadKey !== props.reloadKey
    loadedRef.current = { path, reloadKey: props.reloadKey }
    if (explicitReload) saveQueue.discard(path)
    clearTimeout(timerRef.current)
    setContent(null)
    setReadFailed(false)
    setMenuOpen(false)
    let live = true
    window.vdoc.readFile(path)
      .then(text => {
        if (!live) return
        const draft = explicitReload ? undefined : saveQueue.draft(path)
        if (draft === undefined) {
          saveQueue.setDisk(path, text)
          setContent(text)
          setSaveState('saved')
        } else {
          setContent(draft)
          setSaveState('unsaved')
        }
      })
      .catch(() => {
        if (!live) return
        setReadFailed(true)
        setContent('Could not read this file.')
      })
    return () => {
      live = false
    }
  }, [path, props.reloadKey, saveQueue])

  // Disk changed under us (external editor, pull, own save echo): refresh the
  // buffer when there is no active draft to protect.
  useEffect(() => window.vdoc.onFilesChanged(changed => {
    if (!changed.includes(path) || saveQueue.hasPending(path) || saveQueue.isSaving(path)) return
    void window.vdoc.readFile(path).then(text => {
      if (saveQueue.hasPending(path) || saveQueue.isSaving(path)) return
      saveQueue.setDisk(path, text)
      setContent(text)
    }).catch(() => undefined)
  }), [path, saveQueue])

  const [backlinks, setBacklinks] = useState<string[]>([])
  useEffect(() => {
    setBacklinks([])
    let live = true
    void window.vdoc.backlinks(path)
      .then(links => live && setBacklinks(links))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [path, props.reloadKey])

  const [labels, setLabels] = useState<string[]>([])
  useEffect(() => {
    setLabels([])
    if (!entry.tracked || entry.ignored || !props.connected) return
    let live = true
    void window.vdoc.labels(path)
      .then(names => live && setLabels(names))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [path, entry.tracked, entry.ignored, props.connected, props.reloadKey])

  /** The split view's preview trails typing by 300ms - mermaid re-renders are not free. */
  const previewContent = useDebouncedContent(content, 300)

  const { onSelect } = props
  /** Preview link clicks: local .md files open in-app, http(s) in the browser. */
  const openLink = useCallback((href: string) => {
    if (/^https?:\/\//i.test(href)) {
      void window.vdoc.openExternal(href).catch(onError)
      return
    }
    const resolved = resolveRelative(path, href)
    if (resolved?.endsWith('.md')) onSelect(resolved)
  }, [onError, onSelect, path])

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
  const ignored = state === 'ignored'
  const loadingDiff = props.diffLoading === path
  const pushMode = pushModeFor(state)
  const canPull = entry.tracked && !ignored && state !== 'untracked' && state !== 'not-found'
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

  const notes: Array<{ text: string, error: boolean, help?: boolean }> = []
  if (meta.hint && (state === 'unverified' || state === 'no-version' || state === 'conflict' || state === 'not-found')) {
    notes.push({ text: meta.hint, error: state === 'conflict' || state === 'not-found', help: true })
  }
  if (ignored && meta.hint) {
    notes.push({ text: meta.hint, error: false })
  }
  if (check?.titleMismatch) {
    notes.push({ text: 'Frontmatter title differs from the body H1 - pushes use the frontmatter title.', error: false })
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
            <IconButton title={`Open in editor - ${shortcutLabel('file.editor')}`} onClick={() => props.onOpenEditor(path)}>✎</IconButton>
            <IconButton title="Show in folder" onClick={() => props.onRevealFinder(path)}>⊞</IconButton>
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
              <span className="text-ink-body">v{check.localVersion ?? '-'}</span>
              <span className="text-glyph">{relationGlyph(state)}</span>
              <span className="hidden text-ink-label @min-[1080px]:inline">remote</span>
              <span className="text-ink-body">v{check.remoteVersion ?? '-'}</span>
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
            disabled={busy || !props.connected || ignored}
            className="flex items-center gap-2 whitespace-nowrap rounded-md border border-primary-edge bg-primary px-4 py-1.5 text-[12.5px] text-primary-ink hover:bg-primary-hover disabled:opacity-40"
          >
            {primary.label}
            {busy && <span className="h-3 w-3 animate-spin rounded-full border border-primary-ink/60 border-t-transparent" />}
          </button>

          <div className="relative">
            <button
              ref={actionsRef}
              onClick={() => setMenuOpen(open => !open)}
              disabled={ignored}
              title={ignored ? 'confluenceIgnore is set - Confluence actions are off for this file' : undefined}
              className="whitespace-nowrap rounded-md border border-control bg-raised px-3 py-1.5 text-[12.5px] text-ink-body hover:bg-hover disabled:opacity-40 disabled:hover:bg-raised"
            >
              Actions ▾
            </button>
            {menuOpen && (
              <ActionsMenu
                entry={entry}
                primaryLabel={primary.label}
                canPull={canPull}
                pushMode={pushMode}
                allowLossyPush={props.allowLossyPush}
                busy={busy}
                connected={props.connected}
                onClose={() => {
                  setMenuOpen(false)
                  actionsRef.current?.focus()
                }}
                onPull={() => props.onPull(path)}
                onForcePull={() => props.onForcePull(path)}
                onPush={force => props.onPush(path, force)}
                onLossyPush={() => props.onPush(path, pushMode === 'force', true)}
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
          {note.help && (
            <button
              onClick={props.onHelp}
              className="shrink-0 whitespace-nowrap text-[12px] text-accent hover:underline"
            >
              What do these terms mean?
            </button>
          )}
        </div>
      ))}

      <div className="flex items-center gap-1 border-b border-line px-[18px]">
        <Tab label="Content" active={view === 'content' || (view === 'diff' && !showDiff)} onClick={() => onView('content')} />
        <Tab label="Preview" active={view === 'preview'} disabled={content === null} onClick={() => onView('preview')} />
        <Tab label="Split" active={view === 'split'} disabled={content === null} onClick={() => onView('split')} />
        <Tab
          label={loadingDiff ? 'Diff…' : 'Diff'}
          active={Boolean(showDiff)}
          disabled={!entry.tracked || ignored || loadingDiff}
          onClick={openDiffTab}
        />
        <Tab label="Comments" active={view === 'comments'} disabled={!entry.tracked || ignored} onClick={() => onView('comments')} />
        <div className="flex-1" />
        {saveState !== 'saved' && (
          <span className={`px-2 text-[11px] ${saveState === 'blocked' ? 'text-conflict' : 'text-ink-faint'}`}>
            {saveState === 'unsaved' ? 'Unsaved' : saveState === 'saving' ? 'Saving…' : 'Save blocked'}
          </span>
        )}
        {labels.length > 0 && (
          <div className="hidden items-center gap-1 px-1 @min-[860px]:flex" title="Confluence labels">
            {labels.map(label => (
              <span
                key={label}
                className="whitespace-nowrap rounded-full border border-control bg-raised px-2 py-0.5 text-[10.5px] text-ink-dim"
              >
                {label}
              </span>
            ))}
          </div>
        )}
        {backlinks.length > 0 && <BacklinksButton links={backlinks} onPick={onSelect} />}
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
                          title="Content is identical - record the local-edit baseline so this file shows Synced"
                        >
                          Verify
                        </button>
                      )}
                    </div>
                  )
                : (
                    <div className="flex h-full flex-col">
                      <div className="flex border-b border-line font-mono text-[11px] text-ink-dim">
                        <span className="flex-1 px-4 py-1.5">Confluence - v{props.diff.result.remoteVersion}</span>
                        <span className="flex-1 border-l border-line px-4 py-1.5">Local - v{props.diff.result.localVersion ?? '-'}</span>
                      </div>
                      <div className="min-h-0 flex-1">
                        <Suspense fallback={<CenterNote text="Loading diff…" tone="text-ink-faint" />}>
                          <DiffView remote={props.diff.result.remote} local={props.diff.result.local} theme={props.theme} />
                        </Suspense>
                      </div>
                    </div>
                  )
            )
          : content === null
            ? <CenterNote text="Loading…" tone="text-ink-faint" />
            : (
                // Once loaded, editor and preview stay mounted so their state survives tab switches.
                <div className="flex h-full">
                  <div className={`min-w-0 ${view === 'split' ? 'flex-1' : view === 'preview' ? 'hidden' : 'flex-1'}`}>
                    {editorLoaded && (
                      <Suspense fallback={<CenterNote text="Loading editor…" tone="text-ink-faint" />}>
                        <CodeView content={content} onChange={readFailed ? undefined : handleEdit} onSave={flush} theme={props.theme} />
                      </Suspense>
                    )}
                  </div>
                  {view === 'split' && <div className="w-px shrink-0 bg-line" />}
                  <div className={`min-w-0 ${view === 'split' ? 'flex-1' : view === 'preview' ? 'flex-1' : 'hidden'}`}>
                    {previewContent !== null && <PreviewView content={previewContent} theme={props.theme} findSeq={props.findSeq} onOpenLink={openLink} />}
                  </div>
                </div>
              )}
      </div>
    </div>
  )
}

/**
 * Trailing debounce; null (file switch, loading) resets immediately, and the first
 * value after a reset lands immediately too - the preview opens without a blank beat.
 */
function useDebouncedContent(value: string | null, ms: number): string | null {
  const [debounced, setDebounced] = useState(value)
  const settleRef = useRef(true)
  useEffect(() => {
    if (value === null) {
      settleRef.current = true
      setDebounced(null)
      return
    }
    if (settleRef.current) {
      settleRef.current = false
      setDebounced(value)
      return
    }
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

/** = equal · → local behind remote · ← local ahead · ≠ diverged. */
function relationGlyph(state: ReturnType<typeof displayState>): string {
  if (state === 'behind') return '→'
  if (state === 'ahead' || state === 'local-edits') return '←'
  if (state === 'conflict') return '≠'
  return '='
}

function ActionsMenu({ entry, primaryLabel, canPull, pushMode, allowLossyPush, busy, connected, onClose, onPull, onForcePull, onPush, onLossyPush, onSync, onCreate, onOpenConfluence }: {
  entry: FileEntry
  primaryLabel: string
  canPull: boolean
  pushMode: PushMode
  allowLossyPush: boolean
  busy: boolean
  connected: boolean
  onClose(): void
  onPull(): void
  onForcePull(): void
  onPush(force: boolean): void
  onLossyPush(): void
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
      // The wrapper also holds the Actions button - its own onClick handles the toggle.
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
      <ActionItem
        label="Force pull (overwrite local)"
        disabled={!canPull || confluenceOff}
        onClick={item(onForcePull)}
      />
      {primaryLabel !== 'Push' && (
        <ActionItem
          label={`Push local${check?.localVersion ? ` v${check.localVersion}` : ''}`}
          shortcut={shortcutLabel('sync.push')}
          disabled={pushMode === 'disabled' || confluenceOff}
          onClick={item(() => onPush(pushMode === 'force'))}
        />
      )}
      {entry.tracked && (
        <ActionItem
          label="Push force (overwrite remote)"
          disabled={!allowLossyPush || confluenceOff}
          reason={!allowLossyPush ? 'after blocked push' : undefined}
          onClick={item(onLossyPush)}
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

/** Docs linking to this one - click a row to open it. Same popover idiom as ActionsMenu. */
function BacklinksButton({ links, onPick }: { links: string[], onPick(path: string): void }) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    const onClick = (event: MouseEvent): void => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen(current => !current)}
        title={`${links.length} doc(s) link to this file`}
        className={`px-3 py-2 text-[12px] hover:text-ink ${open ? 'text-ink' : 'text-ink-label'}`}
      >
        ⭠ {links.length} linked from
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 max-h-80 w-[300px] overflow-y-auto rounded-lg border border-line-menu bg-overlay p-1.5 shadow-menu">
          {links.map(link => (
            <button
              key={link}
              onClick={() => {
                setOpen(false)
                onPick(link)
              }}
              className="flex w-full flex-col items-start rounded px-2.5 py-1.5 text-left hover:bg-selected"
            >
              <span className="w-full truncate text-[12.5px] text-ink-body">{link.split('/').at(-1)}</span>
              <span className="w-full truncate text-[10.5px] text-ink-ghost">{link.split('/').slice(0, -1).join('/')}</span>
            </button>
          ))}
        </div>
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
