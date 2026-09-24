import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { DiffResult, VdocLogEntry } from '../../../shared/types.ts'
import { parseFrontmatter } from '../../../shared/frontmatter.ts'
import { diffLines, hunksOf } from '../../../shared/line-diff.ts'
import { resolveRelative } from '../../../shared/links.ts'
import { GuardedSaveQueue } from '../../../shared/save-queue.ts'
import { displayState, displayTitle, syncGroup, type FileEntry } from '../../../shared/status.ts'
import { timeAgo } from '../../../shared/time.ts'
import { command, isPinned, primaryAction, secondaryActions, shortcutLabel, type CommandContext, type ViewMode } from '../commands.ts'
import { AlertIcon, BanIcon, ChevronDownIcon, ExternalIcon, MoreIcon, PinIcon } from '../icons.tsx'
import { STATE_META } from '../state-meta.ts'
import type { SyncEvent } from '../useApp.ts'
import { ActionMenu } from './ActionMenu.tsx'
import { CommentsView } from './CommentsView.tsx'
import { DocumentInfo } from './DocumentInfo.tsx'
import { PreviewView, type OutlineItem } from './PreviewView.tsx'
import { StateGlyph } from './StateGlyph.tsx'

const CodeView = lazy(() => import('./CodeView.tsx').then(module => ({ default: module.CodeView })))
const DiffView = lazy(() => import('./DiffView.tsx').then(module => ({ default: module.DiffView })))

export type SourceLayout = 'content' | 'split'

interface Props {
  ctx: CommandContext
  entry: FileEntry
  diff: { path: string, result: DiffResult } | null
  diffLoading: string | null
  busyOp: string | null
  theme: 'dark' | 'light'
  connected: boolean
  lastChecked: Date | null
  lastSync: SyncEvent | undefined
  lastCli: VdocLogEntry | undefined
  /** The active tab - owned by App so commands can drive it. */
  view: ViewMode
  /** Source tab layout, persisted per workspace. */
  sourceLayout: SourceLayout
  infoOpen: boolean
  /** Bumped by the Reload-from-disk command to re-read the file. */
  reloadKey: number
  /** Bumped by ⌘F - opens (or refocuses) the preview's find bar. */
  findSeq: number
  onView(view: ViewMode): void
  onOpenLogs(): void
  onError(error: unknown): void
  onRegisterFlush(flush: (() => Promise<boolean>) | null): void
  /** Open the sync-concepts help modal (the state strips link to it). */
  onHelp(): void
  /** Navigate to another file in the tree (backlink row, local link in the preview). */
  onSelect(path: string): void
  onDiff(path: string): void
  onMarkVerified(path: string): void
  onLint(path: string): void
}

const TONE = {
  primary: 'border-primary-edge bg-primary text-primary-ink hover:bg-primary-hover',
  secondary: 'border-control bg-raised text-control-ink hover:bg-hover',
  danger: 'border-danger-edge bg-danger text-danger-ink hover:bg-danger-hover',
}

export function DetailPane(props: Props) {
  const { ctx, entry, view, onError } = props
  const [content, setContent] = useState<string | null>(null)
  const [readFailed, setReadFailed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [editorLoaded, setEditorLoaded] = useState(false)
  const [saveState, setSaveState] = useState<'saved' | 'unsaved' | 'saving' | 'blocked'>('saved')

  const [outline, setOutlineState] = useState<OutlineItem[]>([])
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const jumpRef = useRef<((id: string) => void) | null>(null)
  const setOutline = useCallback((items: OutlineItem[]) => {
    setOutlineState(items)
    setActiveSection(current => (items.some(item => item.id === current) ? current : items[0]?.id ?? null))
  }, [])

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
    setOutlineState([])
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
  const group = syncGroup(state)
  const meta = STATE_META[state]
  const check = entry.check
  const busy = props.busyOp !== null
  const ignored = state === 'ignored'
  const loadingDiff = props.diffLoading === path
  const showDiff = view === 'diff' && diffReady && props.diff
  const synced = group === 'synced'
  const pageId = ignored ? undefined : check?.pageId ?? entry.pageId
  const space = useMemo(() => (content === null ? undefined : parseFrontmatter(content).confluenceSpace), [content])
    ?? ctx.app.spaceMapping[path.split('/')[0]]
  const hunkCount = useMemo(
    () => (state === 'conflict' && diffReady && props.diff ? hunksOf(diffLines(props.diff.result.local, props.diff.result.remote)).length : null),
    [state, diffReady, props.diff],
  )
  const primary = primaryAction(state)
  const primaryCommand = primary ? command(primary.commandId) : null
  const primaryReason = primaryCommand?.reason?.(ctx)

  /** Outline clicks read in the preview - leave Source/Diff/Comments for it first. */
  const jumpToSection = (id: string): void => {
    setActiveSection(id)
    if (view === 'preview' || view === 'split') {
      jumpRef.current?.(id)
      return
    }
    onView('preview')
    setTimeout(() => jumpRef.current?.(id), 0)
  }

  const openDiffTab = (): void => (diffReady ? onView('diff') : props.onDiff(path))
  const openSource = (): void => onView(props.sourceLayout)
  const sourceActive = view === 'content' || view === 'split'

  const notes: Array<{ text: string, error: boolean, help?: boolean }> = []
  if (meta.hint && (state === 'conflict' || state === 'not-found' || state === 'no-version')) {
    notes.push({ text: meta.hint, error: state === 'conflict' || state === 'not-found', help: true })
  }
  if (check?.titleMismatch) {
    notes.push({ text: 'Frontmatter title differs from the body H1 - pushes use the frontmatter title.', error: false })
  }

  const versionsTitle = check
    ? `Local version ${check.localVersion ?? '-'} · Confluence version ${check.remoteVersion ?? '-'}${props.lastSync ? ` · last synchronized ${new Date(props.lastSync.at).toLocaleString()}` : ''}`
    : undefined

  return (
    <div className="flex h-full min-w-0 bg-pane">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-col gap-[14px] px-[30px] pt-[22px]">
          <div className="flex items-start gap-5">
            <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
              <h1 className="truncate text-[20px] font-semibold tracking-[-0.2px] text-ink" title={displayTitle(entry)}>{displayTitle(entry)}</h1>
              <div className="flex flex-wrap items-center gap-[11px] text-[12.5px]">
                {ignored
                  ? (
                      <>
                        <span className="inline-flex items-center gap-[7px] text-ink-dim"><BanIcon size={12} className="shrink-0 text-ink-mute" />Not synced with Confluence</span>
                        {isPinned(ctx) && <><Sep /><span className="inline-flex items-center gap-[7px] text-ink-dim"><PinIcon size={11} className="shrink-0 text-brand" />Pinned</span></>}
                        {entry.mtimeMs !== undefined && <><Sep /><span className="text-ink-mute">edited {timeAgo(entry.mtimeMs)}</span></>}
                      </>
                    )
                  : (
                      <>
                        <StateGlyph group={group} word={meta.label} />
                        {state === 'conflict'
                          ? <><Sep /><span className="text-ink-dim">both sides changed{hunkCount ? ` · ${hunkCount} hunk${hunkCount === 1 ? '' : 's'}` : ''}</span></>
                          : group === 'unchecked'
                            ? <><Sep /><span className="text-ink-dim">no baseline recorded</span></>
                            : check && (check.localVersion !== undefined || check.remoteVersion !== undefined) && (
                              <>
                                <Sep />
                                <span title={versionsTitle} className="text-ink-dim">
                                  {group === 'remote' ? `Confluence v${check.remoteVersion ?? '-'} · Local v${check.localVersion ?? '-'}` : `Local v${check.localVersion ?? '-'} · Confluence v${check.remoteVersion ?? '-'}`}
                                </span>
                              </>
                            )}
                        {pageId && (
                          <>
                            <Sep />
                            <button
                              onClick={() => command('file.browser').run(ctx)}
                              title={`Open in Confluence - ${space ? `${space} / ` : ''}${pageId}`}
                              className="inline-flex items-center gap-[5px] text-link hover:text-link-hover"
                            >
                              page <span className="font-mono text-[12px]">{pageId}</span><ExternalIcon size={11} className="shrink-0" />
                            </button>
                          </>
                        )}
                        {check && props.lastChecked && <><Sep /><span className="text-ink-mute">checked {timeAgo(props.lastChecked)}</span></>}
                      </>
                    )}
                {saveState !== 'saved' && (
                  <>
                    <Sep />
                    <span className={saveState === 'blocked' ? 'text-conflict' : 'text-ink-label'}>
                      {saveState === 'unsaved' ? 'Unsaved' : saveState === 'saving' ? 'Saving…' : 'Save blocked'}
                    </span>
                  </>
                )}
              </div>
              {/* Ellipsised from the left so the filename stays visible. */}
              <span dir="rtl" className="truncate text-left font-mono text-[11px] text-ink-label" title={path}>
                <bdi dir="ltr">{path}</bdi>
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {primary && primaryCommand && (
                <button
                  onClick={() => primaryCommand.run(ctx)}
                  disabled={primaryReason !== undefined}
                  title={primaryReason ? `${primary.label} - ${primaryReason}` : `${primary.label} - ${shortcutLabel('doc.primary')}`}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-md border px-[15px] py-[7px] text-[12.5px] font-medium disabled:opacity-40 ${TONE[primary.tone]}`}
                >
                  {primary.label}
                  {busy && <span className="h-3 w-3 animate-spin rounded-full border border-current/60 border-t-transparent" />}
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(open => !open)}
                  title="More actions"
                  className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-control bg-raised text-ink-body hover:bg-hover hover:text-ink"
                >
                  <MoreIcon size={15} />
                </button>
                {menuOpen && <ActionMenu ctx={ctx} items={secondaryActions(ctx)} onClose={() => setMenuOpen(false)} />}
              </div>
            </div>
          </div>

          {ignored && (
            <div className="flex items-center gap-3 rounded-[7px] border border-callout-edge bg-callout px-[14px] py-[10px]">
              <BanIcon size={13} className="shrink-0 text-ink-mute" />
              <span className="flex-1 text-[12.5px] leading-[1.5] text-ink-body">
                <span className="font-mono text-ink">confluenceIgnore: true</span> in the frontmatter - the CLI skips this file for checks, diffs and sync.
              </span>
              <button
                onClick={() => command('file.ignore').run(ctx)}
                disabled={command('file.ignore').reason?.(ctx) !== undefined}
                className="shrink-0 whitespace-nowrap rounded-md border border-control bg-raised px-3 py-[5px] text-[12px] text-ink-body hover:bg-hover disabled:opacity-40"
              >
                Include in Confluence
              </button>
            </div>
          )}

          {notes.map(note => (
            <div
              key={note.text}
              className={`flex items-center gap-[9px] rounded-[7px] border px-3 py-[9px] ${note.error ? 'border-bad-edge bg-bad-bg' : 'border-banner-edge bg-banner-bg'}`}
            >
              <AlertIcon size={13} className={`shrink-0 ${note.error ? 'text-conflict' : 'text-banner-glyph'}`} />
              <span className={`flex-1 text-[12px] leading-relaxed ${note.error ? 'text-bad-ink' : 'text-banner-ink'}`}>{note.text}</span>
              {note.help && (
                <button onClick={props.onHelp} className="shrink-0 whitespace-nowrap text-[12px] text-accent hover:underline">
                  What do these terms mean?
                </button>
              )}
            </div>
          ))}

          <div className="flex items-center gap-1 border-b border-line-subtle">
            <Tab label="Preview" active={view === 'preview'} disabled={content === null} onClick={() => onView('preview')} />
            <div className="relative flex items-center">
              <Tab label="Source" active={sourceActive} disabled={content === null} onClick={openSource} className="pr-1.5" />
              <button
                aria-label="Source layout"
                aria-haspopup="menu"
                aria-expanded={layoutOpen}
                title="Layout: Editor / Editor + Preview"
                disabled={content === null}
                onClick={() => setLayoutOpen(open => !open)}
                className={`flex self-stretch items-center border-b-2 pl-0.5 pr-[13px] text-ink-mute enabled:hover:text-ink disabled:text-ink-disabled ${sourceActive ? 'border-accent' : 'border-transparent'}`}
              >
                <ChevronDownIcon size={12} />
              </button>
              {layoutOpen && (
                <ActionMenu
                  ctx={ctx}
                  items={[{ id: 'view.content', label: 'Editor' }, { id: 'view.split', label: 'Editor + Preview' }]}
                  align="left"
                  onClose={() => setLayoutOpen(false)}
                />
              )}
            </div>
            {!ignored && (
              <>
                <Tab
                  label={loadingDiff ? 'Diff…' : 'Diff'}
                  active={Boolean(showDiff)}
                  disabled={!entry.tracked || loadingDiff || synced}
                  title={synced ? 'No differences to show' : undefined}
                  onClick={openDiffTab}
                />
                <Tab label="Comments" active={view === 'comments'} disabled={!entry.tracked} onClick={() => onView('comments')} />
              </>
            )}
            <div className="flex-1" />
            {backlinks.length > 0 && <BacklinksButton links={backlinks} onPick={onSelect} />}
            <button
              onClick={() => props.onLint(path)}
              disabled={busy}
              className="px-[11px] py-[9px] text-[11.5px] text-ink-mute hover:text-ink-body disabled:opacity-40"
            >
              Lint
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-content">
            {view === 'comments'
              ? <CommentsView path={path} onError={props.onError} />
              : showDiff && props.diff
              ? (
                  props.diff.result.identical
                    ? (
                        <div className="flex h-full flex-col items-center justify-center gap-3">
                          <p className="text-[12.5px] text-sync-text">No content differences with Confluence</p>
                          {state === 'unverified' && !props.diff.result.versionDrift && (
                            <button
                              onClick={() => props.onMarkVerified(path)}
                              disabled={busy}
                              className="rounded-md border border-ok-edge px-3 py-1.5 text-[12px] text-sync-text hover:bg-ok-bg disabled:opacity-40"
                              title="Content is identical - record the baseline so this document shows Synced"
                            >
                              Verify
                            </button>
                          )}
                        </div>
                      )
                    : (
                        <div className="flex h-full flex-col">
                          <div className="flex border-b border-line text-[11px] uppercase tracking-[0.08em] text-ink-label">
                            <span className="flex-1 px-4 py-1.5">Local <span className="font-mono normal-case tracking-normal">v{props.diff.result.localVersion ?? '-'}</span></span>
                            <span className="flex-1 border-l border-line px-4 py-1.5">Confluence <span className="font-mono normal-case tracking-normal">v{props.diff.result.remoteVersion}</span></span>
                          </div>
                          <div className="min-h-0 flex-1">
                            <Suspense fallback={<CenterNote text="Loading diff…" />}>
                              <DiffView remote={props.diff.result.remote} local={props.diff.result.local} theme={props.theme} />
                            </Suspense>
                          </div>
                        </div>
                      )
                )
              : content === null
                ? <CenterNote text="Loading…" />
                : (
                    // Once loaded, editor and preview stay mounted so their state survives tab switches.
                    <div className="flex h-full">
                      <div className={`min-w-0 ${view === 'split' ? 'flex-1' : view === 'preview' ? 'hidden' : 'flex-1'}`}>
                        {editorLoaded && (
                          <Suspense fallback={<CenterNote text="Loading editor…" />}>
                            <CodeView content={content} onChange={readFailed ? undefined : handleEdit} onSave={flush} theme={props.theme} />
                          </Suspense>
                        )}
                      </div>
                      {view === 'split' && <div className="w-px shrink-0 bg-line" />}
                      <div className={`min-w-0 ${view === 'split' ? 'flex-1' : view === 'preview' ? 'flex-1' : 'hidden'}`}>
                        {previewContent !== null && (
                          <PreviewView
                            content={previewContent}
                            theme={props.theme}
                            findSeq={props.findSeq}
                            onOpenLink={openLink}
                            onOutline={setOutline}
                            onActiveSection={setActiveSection}
                            jumpRef={jumpRef}
                          />
                        )}
                      </div>
                    </div>
                  )}
        </div>
      </div>
      {props.infoOpen && (
        <DocumentInfo
          ctx={ctx}
          entry={entry}
          content={content}
          space={space}
          labels={labels}
          lastSync={props.lastSync}
          lastCli={props.lastCli}
          outline={outline}
          activeSection={activeSection}
          onJump={jumpToSection}
          onOpenLogs={props.onOpenLogs}
        />
      )}
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

function Sep() {
  return <span className="text-sep">·</span>
}

/** Docs linking to this one - click a row to open it. */
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
        title={`${links.length} document(s) link to this one`}
        className={`px-[11px] py-[9px] text-[11.5px] hover:text-ink-body ${open ? 'text-ink' : 'text-ink-mute'}`}
      >
        {links.length} linked from
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
              <span className="w-full truncate font-mono text-[10.5px] text-ink-label">{link.split('/').slice(0, -1).join('/')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Tab({ label, active, disabled, title, className = '', onClick }: {
  label: string
  active: boolean
  disabled?: boolean
  title?: string
  className?: string
  onClick(): void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-[13px] py-[9px] text-[12.5px] disabled:cursor-not-allowed ${className} ${
        active ? 'border-accent font-medium text-ink' : 'border-transparent text-ink-dim enabled:hover:text-ink disabled:text-ink-disabled'
      }`}
    >
      {label}
    </button>
  )
}

function CenterNote({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-[12px] text-ink-label">{text}</div>
}
