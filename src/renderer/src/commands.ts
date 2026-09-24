import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Ban, Check, ChevronLeft, ChevronRight, CircleArrowUp, CircleHelp, Columns3, Clock, Command as CommandKey, Copy, CornerDownLeft, Download, ExternalLink, FilePlus, FileText, FolderOpen, House, KeyRound, Link, ListTree, PanelLeft, PanelRight, Pin, Plus, Power, RefreshCw, RotateCw, Search, Settings, Sparkles, SquarePen, SunMoon, Terminal, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import type { ChangesScope, DisplayState } from '../../shared/types.ts'
import { displayState, syncGroup, type FileEntry } from '../../shared/status.ts'
import type { AppStore } from './useApp.ts'

/**
 * The one shortcut registry. Menus, buttons, tooltips and the command palette all read
 * their label and keycaps from here, so a binding can never drift between two places.
 */

type CommandGroup = 'Sync' | 'File' | 'View' | 'App'

export const IS_MAC = navigator.platform.startsWith('Mac')

/** The platform's primary modifier - ⌘ on macOS, Ctrl elsewhere. */
export const isMod = (event: KeyboardEvent): boolean => (IS_MAC ? event.metaKey : event.ctrlKey)

export interface KeyBinding {
  /** `event.key`, compared case-insensitively (`,` `1` `r` `Escape`). */
  key: string
  /** The platform's primary modifier: ⌘ on macOS, Ctrl on Windows/Linux. */
  meta?: boolean
  shift?: boolean
  alt?: boolean
}

export type ViewMode = 'content' | 'preview' | 'split' | 'diff' | 'comments'

export type SidebarMode = 'changes' | 'all'

/** Everything a command needs to decide whether it can run, and to run. */
export interface CommandContext {
  app: AppStore
  selection: string | null
  entry: FileEntry | null
  state: DisplayState | null
  theme: 'dark' | 'light'
  view: ViewMode
  sidebarMode: SidebarMode
  checking: boolean
  busy: boolean
  connected: boolean
  /** The current view has an inspector (document view) - ⌘I stands down elsewhere. */
  inspectorAvailable: boolean
  openPalette(mode: 'file' | 'command' | 'recent' | 'search'): void
  openSettings(): void
  openToken(): void
  openLogs(): void
  openHelp(): void
  openTour(): void
  setView(view: ViewMode): void
  setSidebarMode(mode: SidebarMode): void
  openChanges(scope?: ChangesScope): void
  /** Select the document and open its diff. */
  openDiff(path: string): void
  /** Select the document and open the per-hunk conflict review. */
  openResolve(path: string): void
  /** Open (or refocus) the in-document find bar over the preview. */
  openFind(): void
  toggleSidebar(): void
  toggleInfo(): void
  /** Focus mode: hides both panels, or shows both again. */
  toggleFocus(): void
  toggleTheme(): void
  reloadFile(): void
}

export interface Command {
  id: string
  group: CommandGroup
  /** Without the scope - the palette renders `${group}: ${label}`. */
  label: string
  icon: LucideIcon
  /** Icon tint; the palette maps it to a state colour. */
  tint?: 'pull' | 'push' | 'create' | 'danger'
  keys?: KeyBinding
  /** `undefined` = available. A string says why not, and is shown inline in the palette. */
  reason?(ctx: CommandContext): string | undefined
  /** Contextual detail from the selected file, e.g. `v7 → v10`. */
  suffix?(ctx: CommandContext): string | undefined
  run(ctx: CommandContext): void
}

const noFile = (ctx: CommandContext): string | undefined => (ctx.selection ? undefined : 'no document selected')

const notIgnored = (ctx: CommandContext): string | undefined =>
  (ctx.entry?.ignored ? 'document is excluded from Confluence sync' : undefined)

/** Linked = a confluencePageId in the frontmatter; whether it was checked yet is a separate question. */
const linked = (ctx: CommandContext): string | undefined =>
  noFile(ctx) ?? notIgnored(ctx) ?? (ctx.entry?.tracked ? undefined : 'document has no Confluence page')

const idle = (ctx: CommandContext): string | undefined => (ctx.busy || ctx.checking ? 'a task is running' : undefined)

const online = (ctx: CommandContext): string | undefined => (ctx.connected ? undefined : 'not connected to Confluence')

const inGroup = (groups: string[], why: string) => (ctx: CommandContext): string | undefined =>
  (ctx.state && groups.includes(syncGroup(ctx.state)) ? undefined : why)

/** First failing precondition wins - the palette shows exactly one reason. */
const all = (...checks: Array<(ctx: CommandContext) => string | undefined>) =>
  (ctx: CommandContext): string | undefined => {
    for (const check of checks) {
      const reason = check(ctx)
      if (reason) return reason
    }
    return undefined
  }

const versions = (ctx: CommandContext): string | undefined => {
  const check = ctx.entry?.check
  if (!check || (check.localVersion === undefined && check.remoteVersion === undefined)) return undefined
  return `Local v${check.localVersion ?? '-'} · Confluence v${check.remoteVersion ?? '-'}`
}

export const copy = (ctx: CommandContext, text: string, what: string): void => {
  void window.vdoc.copyText(text).then(
    () => ctx.app.notify(`${what} copied`),
    error => ctx.app.reportError(error),
  )
}

/** OS-native absolute path for pasting outside the app (app-internal paths always use '/'). */
export const absolutePath = (root: string, path: string): string =>
  (root.includes('\\') ? `${root}\\${path.replaceAll('/', '\\')}` : `${root}/${path}`)

/** The same registry, aimed at another document - Changes rows run commands without selecting. */
export function forPath(ctx: CommandContext, path: string): CommandContext {
  const entry = ctx.app.entries.get(path) ?? null
  return { ...ctx, selection: path, entry, state: selectionState(entry) }
}

export interface PrimaryAction {
  label: string
  commandId: string
  tone: 'primary' | 'secondary' | 'danger'
}

/** One primary per document, derived from its state. Synced is the only calm (secondary) one. */
export function primaryAction(state: DisplayState | null): PrimaryAction | null {
  if (!state) return null
  switch (syncGroup(state)) {
    case 'synced': return { label: 'Recheck', commandId: 'sync.check', tone: 'secondary' }
    case 'local': return { label: 'Push to Confluence', commandId: 'sync.push', tone: 'primary' }
    case 'remote': return { label: 'Review changes', commandId: 'view.diff', tone: 'primary' }
    case 'conflict': return state === 'conflict'
      ? { label: 'Resolve conflict', commandId: 'sync.resolve', tone: 'danger' }
      : { label: 'Recheck', commandId: 'sync.check', tone: 'secondary' }
    case 'unchecked': return state === 'unverified'
      ? { label: 'Verify document', commandId: 'sync.baseline', tone: 'primary' }
      : { label: 'Check document', commandId: 'sync.check', tone: 'primary' }
    case 'unlinked': return { label: 'Create page', commandId: 'sync.create', tone: 'primary' }
    case 'ignored': return null
  }
}

/** What ⌘⏎ runs: the document's primary, or on Changes the bulk pull when anything is remote. */
function visiblePrimary(ctx: CommandContext): PrimaryAction | null {
  if (ctx.selection) return primaryAction(ctx.state)
  const remote = ctx.app.counts.remote
  return remote > 0 ? { label: `Pull ${remote} remote update${remote === 1 ? '' : 's'}`, commandId: 'sync.pullAll', tone: 'primary' } : null
}

/** What `⋯` offers per state - everything that is not the primary. */
export function secondaryActions(state: DisplayState | null): string[] {
  const common = ['file.editor', 'file.finder', 'file.copyUrl', 'file.browser', 'file.copyPath', 'file.ignore']
  if (!state) return common
  switch (syncGroup(state)) {
    case 'synced': return ['sync.push', 'sync.pull', 'sync.lossyPush', ...common]
    case 'local': return ['sync.forcePull', 'sync.lossyPush', 'view.diff', ...common]
    case 'remote': return ['sync.pull', 'sync.forcePush', 'sync.lossyPush', ...common]
    case 'conflict': return ['sync.forcePush', 'sync.forcePull', 'sync.lossyPush', 'view.diff', ...common]
    case 'unchecked': return ['sync.baseline', 'sync.push', 'sync.pull', 'view.diff', ...common]
    case 'unlinked': return ['sync.link', 'file.init', ...common]
    case 'ignored': return common
  }
}

const viewCommand = (view: ViewMode, label: string, keys?: KeyBinding): Command => ({
  id: `view.${view}`,
  group: 'View',
  label,
  icon: FileText,
  keys,
  reason: view === 'diff' || view === 'comments'
    ? all(noFile, notIgnored, ctx => (ctx.entry?.tracked ? undefined : 'document is not linked'))
    : noFile,
  run: ctx => (view === 'diff' ? ctx.openDiff(ctx.selection!) : ctx.setView(view)),
})

export const COMMANDS: Command[] = [
  {
    id: 'doc.primary',
    group: 'Sync',
    label: 'Run the primary action',
    icon: CornerDownLeft,
    keys: { key: 'Enter', meta: true },
    reason: ctx => {
      const primary = visiblePrimary(ctx)
      return primary ? command(primary.commandId).reason?.(ctx) : 'no primary action here'
    },
    suffix: ctx => visiblePrimary(ctx)?.label,
    run: ctx => {
      const primary = visiblePrimary(ctx)
      if (primary) command(primary.commandId).run(ctx)
    },
  },
  {
    id: 'sync.check',
    group: 'Sync',
    label: 'Check this document',
    icon: RefreshCw,
    keys: { key: 'r', meta: true },
    reason: all(linked, idle, online),
    run: ctx => void ctx.app.checkOne(ctx.selection!),
  },
  {
    id: 'sync.checkAll',
    group: 'Sync',
    label: 'Check workspace',
    icon: RefreshCw,
    keys: { key: 'r', meta: true, shift: true },
    reason: all(ctx => (ctx.checking ? 'a check is already running' : undefined), online),
    run: ctx => void ctx.app.checkAll(),
  },
  {
    id: 'sync.baseline',
    group: 'Sync',
    label: 'Verify against Confluence',
    icon: Check,
    reason: all(linked, ctx => (ctx.state === 'unverified' ? undefined : 'document already has a baseline'), idle, online),
    run: ctx => void ctx.app.markVerified(ctx.selection!),
  },
  {
    id: 'sync.pull',
    group: 'Sync',
    label: 'Pull without reviewing',
    icon: ArrowDown,
    tint: 'pull',
    keys: { key: 'd', meta: true, shift: true },
    reason: all(linked, inGroup(['remote', 'synced', 'unchecked'], 'nothing to pull'), idle, online),
    suffix: versions,
    run: ctx => ctx.app.requestPull(ctx.selection!),
  },
  {
    id: 'sync.pullAll',
    group: 'Sync',
    label: 'Pull all remote changes',
    icon: ArrowDownToLine,
    tint: 'pull',
    keys: { key: 'd', meta: true, alt: true },
    reason: all(ctx => (ctx.app.counts.remote > 0 ? undefined : 'nothing has remote changes'), idle, online),
    suffix: ctx => (ctx.app.counts.remote > 0 ? `${ctx.app.counts.remote} document(s)` : undefined),
    run: ctx => ctx.app.pullAll(pathsIn(ctx, 'remote')),
  },
  {
    id: 'sync.forcePull',
    group: 'Sync',
    label: 'Discard local changes (keep all theirs)',
    icon: ArrowDown,
    tint: 'danger',
    reason: all(linked, ctx => (ctx.state === 'not-found' ? 'page not found' : undefined), idle, online),
    run: ctx => ctx.app.setPullConfirm({ paths: [ctx.selection!], force: true }),
  },
  {
    id: 'sync.push',
    group: 'Sync',
    label: 'Push to Confluence',
    icon: ArrowUp,
    tint: 'push',
    keys: { key: 'u', meta: true, shift: true },
    reason: all(linked, inGroup(['local', 'synced', 'unchecked'], 'nothing to push'), idle, online),
    suffix: versions,
    run: ctx => void ctx.app.requestPush(ctx.selection!, false),
  },
  {
    id: 'sync.pushAll',
    group: 'Sync',
    label: 'Push all local changes',
    icon: ArrowUpToLine,
    tint: 'push',
    reason: all(ctx => (ctx.app.counts.local > 0 ? undefined : 'nothing has local changes'), idle, online),
    suffix: ctx => (ctx.app.counts.local > 0 ? `${ctx.app.counts.local} document(s), one preview each` : undefined),
    run: ctx => ctx.app.pushAll(pathsIn(ctx, 'local')),
  },
  {
    id: 'sync.forcePush',
    group: 'Sync',
    label: 'Push over remote changes (keep all mine)',
    icon: ArrowUp,
    tint: 'danger',
    reason: all(linked, inGroup(['remote', 'conflict'], 'Confluence has not moved'), idle, online),
    run: ctx => void ctx.app.requestPush(ctx.selection!, true),
  },
  {
    id: 'sync.lossyPush',
    group: 'Sync',
    label: 'Push force (overwrite remote)',
    icon: ArrowUp,
    tint: 'danger',
    reason: all(linked, ctx => (ctx.app.lossyPushPaths.has(ctx.selection!) ? undefined : 'only after a push was blocked as lossy'), idle, online),
    run: ctx => void ctx.app.requestPush(ctx.selection!, ['remote', 'conflict'].includes(syncGroup(ctx.state!)), true),
  },
  {
    id: 'sync.resolve',
    group: 'Sync',
    label: 'Resolve conflict',
    icon: TriangleAlert,
    tint: 'danger',
    reason: all(linked, ctx => (ctx.state === 'conflict' ? undefined : 'document is not in conflict'), online),
    run: ctx => ctx.openResolve(ctx.selection!),
  },
  {
    id: 'sync.create',
    group: 'Sync',
    label: 'Create Confluence page…',
    icon: Plus,
    tint: 'create',
    keys: { key: 'n', meta: true },
    reason: all(noFile, notIgnored, ctx => (ctx.entry?.tracked ? 'document already has a page' : undefined), idle, online),
    run: ctx => ctx.app.setCreateForm({ path: ctx.selection! }),
  },
  {
    id: 'sync.get',
    group: 'Sync',
    label: 'Get page from Confluence…',
    icon: Download,
    tint: 'pull',
    reason: all(
      ctx => ((ctx.app.settings?.contentDirs.length ?? 0) > 0 ? undefined : 'no folders in the tree - add one in Settings'),
      idle,
      online,
    ),
    run: ctx => ctx.app.setGetForm({}),
  },
  {
    id: 'sync.link',
    group: 'Sync',
    label: 'Link to existing page…',
    icon: Link,
    reason: all(noFile, notIgnored, ctx => (ctx.entry?.tracked ? 'document already has a page' : undefined), idle, online),
    run: ctx => void ctx.app.syncFile(ctx.selection!),
  },
  {
    id: 'sync.cancel',
    group: 'Sync',
    label: 'Cancel running check',
    icon: X,
    keys: { key: 'Escape' },
    reason: ctx => (ctx.checking ? undefined : 'no check is running'),
    run: ctx => ctx.app.cancelCheck(),
  },

  {
    id: 'file.back',
    group: 'File',
    label: 'Back to previous document',
    icon: ChevronLeft,
    keys: { key: '[', meta: true },
    reason: ctx => (ctx.app.canGoBack ? undefined : 'no previous document'),
    run: ctx => ctx.app.goBack(),
  },
  {
    id: 'file.forward',
    group: 'File',
    label: 'Forward to next document',
    icon: ChevronRight,
    keys: { key: ']', meta: true },
    reason: ctx => (ctx.app.canGoForward ? undefined : 'no next document'),
    run: ctx => ctx.app.goForward(),
  },
  {
    id: 'file.goto',
    group: 'File',
    label: 'Search documents…',
    icon: Search,
    keys: { key: 'k', meta: true },
    run: ctx => ctx.openPalette('file'),
  },
  {
    id: 'file.recent',
    group: 'File',
    label: 'Recent documents…',
    icon: Clock,
    reason: ctx => (ctx.app.recents.length > 0 ? undefined : 'no documents opened yet'),
    run: ctx => ctx.openPalette('recent'),
  },
  {
    id: 'file.search',
    group: 'File',
    label: 'Search in documents…',
    icon: Search,
    run: ctx => ctx.openPalette('search'),
  },
  {
    id: 'file.init',
    group: 'File',
    label: 'Initialize frontmatter',
    icon: FilePlus,
    reason: all(noFile, idle),
    run: ctx => void ctx.app.initializeFile(ctx.selection!),
  },
  {
    id: 'file.editor',
    group: 'File',
    label: 'Open in editor',
    icon: SquarePen,
    keys: { key: 'e', meta: true },
    reason: noFile,
    run: ctx => void ctx.app.openEditor(ctx.selection!),
  },
  {
    id: 'file.finder',
    group: 'File',
    label: 'Show in folder',
    icon: FolderOpen,
    keys: { key: 'f', meta: true, shift: true },
    reason: noFile,
    run: ctx => void ctx.app.revealFinder(ctx.selection!),
  },
  {
    id: 'file.copyUrl',
    group: 'File',
    label: 'Copy Confluence URL',
    icon: Copy,
    keys: { key: 'c', meta: true, shift: true },
    reason: linked,
    run: ctx => void ctx.app.confluenceUrl(ctx.selection!).then(url => url && copy(ctx, url, 'Confluence URL')),
  },
  {
    id: 'file.copyId',
    group: 'File',
    label: 'Copy page ID',
    icon: Copy,
    reason: all(noFile, ctx => (ctx.entry?.check?.pageId ?? ctx.entry?.pageId ? undefined : 'no page id in the frontmatter')),
    run: ctx => copy(ctx, (ctx.entry!.check?.pageId ?? ctx.entry!.pageId)!, 'Page ID'),
  },
  {
    id: 'file.copyPath',
    group: 'File',
    label: 'Copy document path',
    icon: Copy,
    reason: noFile,
    run: ctx => copy(ctx, absolutePath(ctx.app.root, ctx.selection!), 'Document path'),
  },
  {
    id: 'file.browser',
    group: 'File',
    label: 'Open page in Confluence',
    icon: ExternalLink,
    keys: { key: 'o', meta: true, shift: true },
    reason: linked,
    run: ctx => void ctx.app.openConfluence(ctx.selection!),
  },
  {
    id: 'file.ignore',
    group: 'File',
    label: 'Ignore this document',
    icon: Ban,
    reason: all(noFile, idle),
    suffix: ctx => (ctx.entry?.ignored ? 'currently ignored - include it again' : undefined),
    run: ctx => void ctx.app.setIgnored(ctx.selection!, !ctx.entry?.ignored),
  },
  {
    id: 'file.pin',
    group: 'File',
    label: 'Pin / unpin on top',
    icon: Pin,
    keys: { key: 'p', meta: true },
    reason: all(noFile, idle),
    suffix: ctx => (ctx.entry?.pinned ? 'currently pinned - unpin it' : undefined),
    run: ctx => void ctx.app.setPinned(ctx.selection!, !ctx.entry?.pinned),
  },
  {
    id: 'file.reload',
    group: 'File',
    label: 'Reload from disk',
    icon: RotateCw,
    keys: { key: 'r', meta: true, alt: true },
    reason: noFile,
    run: ctx => ctx.reloadFile(),
  },

  {
    id: 'view.changes',
    group: 'View',
    label: 'Changes',
    icon: House,
    keys: { key: '1', meta: true },
    run: ctx => {
      ctx.setSidebarMode('changes')
      ctx.openChanges()
    },
  },
  {
    id: 'view.all',
    group: 'View',
    label: 'All documents',
    icon: ListTree,
    keys: { key: '2', meta: true },
    run: ctx => ctx.setSidebarMode('all'),
  },
  viewCommand('preview', 'Preview'),
  viewCommand('content', 'Source: editor'),
  viewCommand('split', 'Source: editor + preview'),
  viewCommand('diff', 'Diff', { key: 'd', meta: true }),
  viewCommand('comments', 'Comments'),
  {
    id: 'view.info',
    group: 'View',
    label: 'Toggle inspector',
    icon: PanelRight,
    keys: { key: 'i', meta: true },
    reason: ctx => (ctx.inspectorAvailable ? undefined : 'no inspector in this view'),
    run: ctx => ctx.toggleInfo(),
  },
  {
    id: 'view.sidebar',
    group: 'View',
    label: 'Toggle sidebar',
    icon: PanelLeft,
    keys: { key: 'b', meta: true },
    run: ctx => ctx.toggleSidebar(),
  },
  {
    id: 'view.focus',
    group: 'View',
    label: 'Toggle both panels (focus mode)',
    icon: Columns3,
    keys: { key: '.', meta: true, shift: true },
    run: ctx => ctx.toggleFocus(),
  },
  {
    id: 'view.find',
    group: 'View',
    label: 'Find in document',
    icon: Search,
    keys: { key: 'f', meta: true },
    reason: all(noFile, ctx => (ctx.view === 'preview' || ctx.view === 'split' ? undefined : 'open the Preview tab first')),
    run: ctx => ctx.openFind(),
  },
  {
    id: 'view.theme',
    group: 'View',
    label: 'Toggle light / dark theme',
    icon: SunMoon,
    keys: { key: 'l', meta: true, shift: true },
    run: ctx => ctx.toggleTheme(),
  },

  {
    id: 'app.palette',
    group: 'App',
    label: 'Open command palette',
    icon: CommandKey,
    keys: { key: 'p', meta: true, shift: true },
    run: ctx => ctx.openPalette('command'),
  },
  {
    id: 'app.settings',
    group: 'App',
    label: 'Open settings',
    icon: Settings,
    keys: { key: ',', meta: true },
    run: ctx => ctx.openSettings(),
  },
  {
    id: 'app.renewToken',
    group: 'App',
    label: 'Refresh credentials…',
    icon: KeyRound,
    run: ctx => ctx.openToken(),
  },
  {
    id: 'app.logs',
    group: 'App',
    label: 'CLI logs',
    icon: Terminal,
    keys: { key: 'j', meta: true },
    run: ctx => ctx.openLogs(),
  },
  {
    id: 'app.help',
    group: 'App',
    label: 'Sync concepts help',
    icon: CircleHelp,
    keys: { key: '/', meta: true },
    run: ctx => ctx.openHelp(),
  },
  {
    id: 'app.tour',
    group: 'App',
    label: 'Welcome tour',
    icon: Sparkles,
    run: ctx => ctx.openTour(),
  },
  {
    id: 'app.checkUpdate',
    group: 'App',
    label: 'Check for updates',
    icon: CircleArrowUp,
    run: ctx => void ctx.app.checkUpdateNow(),
  },
  {
    id: 'app.revealConfig',
    group: 'App',
    label: 'Open config file',
    icon: FolderOpen,
    run: ctx => void ctx.app.revealConfig(),
  },
  {
    id: 'app.reload',
    group: 'App',
    label: 'Reload window',
    icon: RotateCw,
    keys: { key: 'i', meta: true, alt: true },
    run: () => location.reload(),
  },
  {
    id: 'app.quit',
    group: 'App',
    label: 'Quit vdoc',
    icon: Power,
    keys: { key: 'q', meta: true },
    run: ctx => void ctx.app.quit(),
  },
]

function pathsIn(ctx: CommandContext, group: 'remote' | 'local'): string[] {
  return [...ctx.app.entries.values()].filter(entry => syncGroup(displayState(entry)) === group).map(entry => entry.path)
}

const BY_ID = new Map(COMMANDS.map(command => [command.id, command]))

export function command(id: string): Command {
  const found = BY_ID.get(id)
  if (!found) throw new Error(`Unknown command: ${id}`)
  return found
}

/** One cap per key - `⌘⇧R` (mac) / `Ctrl` `Shift` `R` (elsewhere) renders as three caps. */
export function keycaps(keys: KeyBinding | undefined): string[] {
  if (!keys) return []
  const caps: string[] = []
  if (IS_MAC) {
    if (keys.alt) caps.push('⌥')
    if (keys.meta) caps.push('⌘')
    if (keys.shift) caps.push('⇧')
  } else {
    if (keys.meta) caps.push('Ctrl')
    if (keys.alt) caps.push('Alt')
    if (keys.shift) caps.push('Shift')
  }
  caps.push(keys.key === 'Escape' ? 'esc' : keys.key === 'Enter' ? '⏎' : keys.key.length === 1 ? keys.key.toUpperCase() : keys.key)
  return caps
}

/** Flat form for tooltips and menu rows - `⌘⇧R` / `Ctrl+Shift+R`. */
export function shortcutLabel(id: string): string {
  return keycaps(command(id).keys).join(IS_MAC ? '' : '+')
}

/** `Sync: Check this document` - the palette label, also used for fuzzy matching. */
export function fullLabel(cmd: Command): string {
  return `${cmd.group}: ${cmd.label}`
}

const PUNCTUATION_CODES: Record<string, string> = { '.': 'Period', ',': 'Comma', '[': 'BracketLeft', ']': 'BracketRight', '/': 'Slash' }

/** Physical key of a binding - ⌥ rewrites `event.key` on macOS (∂), ⇧ rewrites punctuation (>). */
function codeOf(key: string): string | undefined {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`
  if (/^\d$/.test(key)) return `Digit${key}`
  return PUNCTUATION_CODES[key]
}

function matches(keys: KeyBinding, event: KeyboardEvent): boolean {
  // `meta` means the platform's primary modifier; the other one must stay unpressed.
  const otherMod = IS_MAC ? event.ctrlKey : event.metaKey
  // Physical fallback only where a modifier rewrites the character, so AZERTY letters still match by key.
  const rewritten = Boolean(keys.alt) || (Boolean(keys.shift) && !/^[a-z]$/i.test(keys.key))
  return (event.key.toLowerCase() === keys.key.toLowerCase() || (rewritten && event.code === codeOf(keys.key)))
    && isMod(event) === Boolean(keys.meta)
    && event.shiftKey === Boolean(keys.shift)
    && event.altKey === Boolean(keys.alt)
    && !otherMod
}

/** The bound, currently-available command for a key event - or undefined. */
export function commandFor(event: KeyboardEvent, ctx: CommandContext): Command | undefined {
  return COMMANDS.find(cmd => cmd.keys && matches(cmd.keys, event) && cmd.reason?.(ctx) === undefined)
}

/** Display state of the current selection, for building the context. */
export function selectionState(entry: FileEntry | null): DisplayState | null {
  return entry ? displayState(entry) : null
}
