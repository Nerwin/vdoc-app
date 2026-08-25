import type { DisplayState } from '../../shared/types.ts'
import { displayState, type FileEntry } from '../../shared/status.ts'
import type { AppStore } from './useApp.ts'

/**
 * The one shortcut registry. Menus, buttons, tooltips and the command palette all read
 * their label and keycaps from here, so a binding can never drift between two places.
 */

export type CommandGroup = 'Sync' | 'File' | 'View' | 'App'

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

/** Everything a command needs to decide whether it can run, and to run. */
export interface CommandContext {
  app: AppStore
  selection: string | null
  entry: FileEntry | null
  state: DisplayState | null
  theme: 'dark' | 'light'
  view: ViewMode
  checking: boolean
  busy: boolean
  connected: boolean
  openPalette(mode: 'file' | 'command' | 'recent' | 'search'): void
  openSettings(): void
  openToken(): void
  openLogs(): void
  openHelp(): void
  openTour(): void
  focusFilter(): void
  setView(view: ViewMode): void
  openDiff(): void
  /** Open (or refocus) the in-document find bar over the preview. */
  openFind(): void
  toggleSidebar(): void
  toggleTheme(): void
  reloadFile(): void
}

export interface Command {
  id: string
  group: CommandGroup
  /** Without the scope - the palette renders `${group}: ${label}`. */
  label: string
  icon: string
  /** Icon tint; the palette maps it to a state colour. */
  tint?: 'pull' | 'push' | 'create'
  keys?: KeyBinding
  /** `undefined` = available. A string says why not, and is shown inline in the palette. */
  reason?(ctx: CommandContext): string | undefined
  /** Contextual detail from the selected file, e.g. `v7 → v10`. */
  suffix?(ctx: CommandContext): string | undefined
  run(ctx: CommandContext): void
}

const LINKED_STATES: DisplayState[] = ['in-sync', 'behind', 'ahead', 'local-edits', 'conflict', 'no-version', 'unverified', 'not-found']

const noFile = (ctx: CommandContext): string | undefined => (ctx.selection ? undefined : 'no file selected')

const notIgnored = (ctx: CommandContext): string | undefined =>
  (ctx.entry?.ignored ? 'file is excluded from Confluence sync' : undefined)

const linked = (ctx: CommandContext): string | undefined =>
  noFile(ctx) ?? notIgnored(ctx)
    ?? (ctx.entry?.tracked && LINKED_STATES.includes(ctx.state!) ? undefined : 'file has no Confluence page')

const idle = (ctx: CommandContext): string | undefined => (ctx.busy || ctx.checking ? 'a task is running' : undefined)

const online = (ctx: CommandContext): string | undefined => (ctx.connected ? undefined : 'not connected to Confluence')

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
  return `v${check.localVersion ?? '-'} → v${check.remoteVersion ?? '-'}`
}

export const copy = (ctx: CommandContext, text: string, what: string): void => {
  void navigator.clipboard.writeText(text).then(
    () => ctx.app.notify(`${what} copied`),
    error => ctx.app.reportError(error),
  )
}

const viewCommand = (view: ViewMode, label: string, digit: string): Command => ({
  id: `view.${view}`,
  group: 'View',
  label,
  icon: '▤',
  keys: { key: digit, meta: true },
  reason: view === 'content'
    ? noFile
    : view === 'preview' || view === 'split'
      ? noFile
      : all(noFile, notIgnored, ctx => (ctx.entry?.tracked ? undefined : 'file is not linked')),
  run: ctx => (view === 'diff' ? ctx.openDiff() : ctx.setView(view)),
})

const filterCommand = (filter: 'attention' | 'behind' | 'unverified' | null, label: string): Command => ({
  id: `view.filter.${filter ?? 'all'}`,
  group: 'View',
  label,
  icon: '⚑',
  run: ctx => ctx.app.setStateFilter(filter),
})

export const COMMANDS: Command[] = [
  {
    id: 'sync.check',
    group: 'Sync',
    label: 'Check this file',
    icon: '⟳',
    keys: { key: 'r', meta: true },
    reason: all(linked, idle, online),
    run: ctx => void ctx.app.checkOne(ctx.selection!),
  },
  {
    id: 'sync.checkAll',
    group: 'Sync',
    label: 'Check all files',
    icon: '⟳',
    keys: { key: 'r', meta: true, shift: true },
    reason: all(ctx => (ctx.checking ? 'a check is already running' : undefined), online),
    run: ctx => void ctx.app.checkAll(),
  },
  {
    id: 'sync.pull',
    group: 'Sync',
    label: 'Pull page into this file',
    icon: '↓',
    tint: 'pull',
    keys: { key: 'd', meta: true, shift: true },
    reason: all(
      linked,
      ctx => (ctx.state === 'behind' || ctx.state === 'conflict' ? undefined : 'local file is not behind'),
      idle,
      online,
    ),
    suffix: versions,
    run: ctx => ctx.app.requestPull(ctx.selection!),
  },
  {
    id: 'sync.pullAll',
    group: 'Sync',
    label: 'Pull all behind files',
    icon: '⇊',
    tint: 'pull',
    keys: { key: 'd', meta: true, alt: true },
    reason: all(
      ctx => (ctx.app.counts.behind > 0 ? undefined : 'nothing is behind'),
      idle,
      online,
    ),
    suffix: ctx => (ctx.app.counts.behind > 0 ? `${ctx.app.counts.behind} file(s)` : undefined),
    run: ctx => ctx.app.pullAllBehind(),
  },
  {
    id: 'sync.push',
    group: 'Sync',
    label: 'Push this file to Confluence',
    icon: '↑',
    tint: 'push',
    keys: { key: 'u', meta: true, shift: true },
    reason: all(
      linked,
      ctx => (ctx.state === 'ahead' || ctx.state === 'local-edits' || ctx.state === 'no-version' || ctx.state === 'unverified'
        ? undefined
        : 'no local changes to publish'),
      idle,
      online,
    ),
    suffix: versions,
    run: ctx => void ctx.app.requestPush(ctx.selection!, false),
  },
  {
    id: 'sync.create',
    group: 'Sync',
    label: 'Create Confluence page…',
    icon: '+',
    tint: 'create',
    keys: { key: 'n', meta: true },
    reason: all(noFile, notIgnored, ctx => (ctx.entry?.tracked ? 'file already has a page' : undefined), idle, online),
    run: ctx => ctx.app.setCreateForm({ path: ctx.selection! }),
  },
  {
    id: 'sync.get',
    group: 'Sync',
    label: 'Get page from Confluence…',
    icon: '⇣',
    tint: 'pull',
    reason: all(
      ctx => ((ctx.app.settings?.contentDirs.length ?? 0) > 0 ? undefined : 'no folders in the tree - add one in Settings'),
      idle,
      online,
    ),
    run: ctx => ctx.app.setGetForm(true),
  },
  {
    id: 'sync.link',
    group: 'Sync',
    label: 'Link to existing page…',
    icon: '⚯',
    reason: all(noFile, notIgnored, ctx => (ctx.entry?.tracked ? 'file already has a page' : undefined), idle, online),
    run: ctx => void ctx.app.syncFile(ctx.selection!),
  },
  {
    id: 'sync.baseline',
    group: 'Sync',
    label: 'Verify against Confluence',
    icon: '✓',
    reason: all(linked, ctx => (ctx.state === 'unverified' ? undefined : 'file already has a baseline'), idle, online),
    run: ctx => void ctx.app.markVerified(ctx.selection!),
  },
  {
    id: 'sync.cancel',
    group: 'Sync',
    label: 'Cancel running check',
    icon: '✕',
    keys: { key: 'Escape' },
    reason: ctx => (ctx.checking ? undefined : 'no check is running'),
    run: ctx => ctx.app.cancelCheck(),
  },

  {
    id: 'file.back',
    group: 'File',
    label: 'Back to previous file',
    icon: '‹',
    keys: { key: '[', meta: true },
    reason: ctx => (ctx.app.canGoBack ? undefined : 'no previous file'),
    run: ctx => ctx.app.goBack(),
  },
  {
    id: 'file.forward',
    group: 'File',
    label: 'Forward to next file',
    icon: '›',
    keys: { key: ']', meta: true },
    reason: ctx => (ctx.app.canGoForward ? undefined : 'no next file'),
    run: ctx => ctx.app.goForward(),
  },
  {
    id: 'file.goto',
    group: 'File',
    label: 'Go to file…',
    icon: '⌕',
    keys: { key: 'p', meta: true },
    run: ctx => ctx.openPalette('file'),
  },
  {
    id: 'file.recent',
    group: 'File',
    label: 'Recent files…',
    icon: '◷',
    reason: ctx => (ctx.app.recents.length > 0 ? undefined : 'no files opened yet'),
    run: ctx => ctx.openPalette('recent'),
  },
  {
    id: 'file.init',
    group: 'File',
    label: 'Initialize frontmatter',
    icon: '◆',
    reason: all(noFile, idle),
    run: ctx => void ctx.app.initializeFile(ctx.selection!),
  },
  {
    id: 'file.editor',
    group: 'File',
    label: 'Open in editor',
    icon: '✎',
    keys: { key: 'e', meta: true },
    reason: noFile,
    run: ctx => void ctx.app.openEditor(ctx.selection!),
  },
  {
    id: 'file.search',
    group: 'File',
    label: 'Search in files…',
    icon: '⌕',
    keys: { key: 'f', meta: true, shift: true },
    run: ctx => ctx.openPalette('search'),
  },
  {
    id: 'file.finder',
    group: 'File',
    label: 'Show in folder',
    icon: '⊞',
    reason: noFile,
    run: ctx => void ctx.app.revealFinder(ctx.selection!),
  },
  {
    id: 'file.copyUrl',
    group: 'File',
    label: 'Copy Confluence URL',
    icon: '⧉',
    keys: { key: 'c', meta: true, shift: true },
    reason: linked,
    run: ctx => void ctx.app.confluenceUrl(ctx.selection!).then(url => url && copy(ctx, url, 'Confluence URL')),
  },
  {
    id: 'file.copyId',
    group: 'File',
    label: 'Copy page ID',
    icon: '⧉',
    reason: all(noFile, ctx => (ctx.entry?.check?.pageId ?? ctx.entry?.pageId ? undefined : 'no page id in the frontmatter')),
    run: ctx => copy(ctx, (ctx.entry!.check?.pageId ?? ctx.entry!.pageId)!, 'Page ID'),
  },
  {
    id: 'file.browser',
    group: 'File',
    label: 'Open page in browser',
    icon: '↗',
    keys: { key: 'o', meta: true, shift: true },
    reason: linked,
    run: ctx => void ctx.app.openConfluence(ctx.selection!),
  },
  {
    id: 'file.reload',
    group: 'File',
    label: 'Reload from disk',
    icon: '↻',
    keys: { key: 'r', meta: true, alt: true },
    reason: noFile,
    run: ctx => ctx.reloadFile(),
  },

  viewCommand('content', 'Content', '1'),
  viewCommand('preview', 'Preview', '2'),
  viewCommand('split', 'Split editor + preview', '3'),
  viewCommand('diff', 'Diff', '4'),
  viewCommand('comments', 'Comments', '5'),
  {
    id: 'view.dashboard',
    group: 'View',
    label: 'Show dashboard',
    icon: '⌂',
    reason: ctx => (ctx.selection ? undefined : 'already on the dashboard'),
    run: ctx => ctx.app.setSelection(null),
  },
  {
    id: 'view.sidebar',
    group: 'View',
    label: 'Toggle sidebar',
    icon: '◧',
    keys: { key: 'b', meta: true },
    run: ctx => ctx.toggleSidebar(),
  },
  {
    // Shares ⌘F with the filter field below: with the preview on screen this one
    // wins (commandFor takes the first available match); elsewhere ⌘F filters.
    id: 'view.find',
    group: 'View',
    label: 'Find in document',
    icon: '⌕',
    keys: { key: 'f', meta: true },
    reason: all(noFile, ctx => (ctx.view === 'preview' || ctx.view === 'split' ? undefined : 'open the Preview tab first')),
    run: ctx => ctx.openFind(),
  },
  {
    id: 'view.filterField',
    group: 'View',
    label: 'Focus filter field',
    icon: '⌕',
    keys: { key: 'f', meta: true },
    run: ctx => ctx.focusFilter(),
  },
  filterCommand('attention', 'Filter: needs attention'),
  filterCommand('behind', 'Filter: behind'),
  filterCommand('unverified', 'Filter: unverified'),
  filterCommand(null, 'Filter: all files'),
  {
    id: 'view.theme',
    group: 'View',
    label: 'Toggle light / dark theme',
    icon: '◐',
    keys: { key: 'l', meta: true, shift: true },
    run: ctx => ctx.toggleTheme(),
  },

  {
    id: 'app.palette',
    group: 'App',
    label: 'Open command palette',
    icon: '⌘',
    keys: { key: 'p', meta: true, shift: true },
    run: ctx => ctx.openPalette('command'),
  },
  {
    id: 'app.settings',
    group: 'App',
    label: 'Open settings',
    icon: '⚙',
    keys: { key: ',', meta: true },
    run: ctx => ctx.openSettings(),
  },
  {
    id: 'app.renewToken',
    group: 'App',
    label: 'Renew session token…',
    icon: '⚿',
    run: ctx => ctx.openToken(),
  },
  {
    id: 'app.logs',
    group: 'App',
    label: 'CLI logs',
    icon: '≣',
    run: ctx => ctx.openLogs(),
  },
  {
    id: 'app.help',
    group: 'App',
    label: 'Sync concepts help',
    icon: '?',
    keys: { key: '/', meta: true },
    run: ctx => ctx.openHelp(),
  },
  {
    id: 'app.tour',
    group: 'App',
    label: 'Welcome tour',
    icon: '✦',
    run: ctx => ctx.openTour(),
  },
  {
    id: 'app.checkUpdate',
    group: 'App',
    label: 'Check for updates',
    icon: '⇡',
    run: ctx => void ctx.app.checkUpdateNow(),
  },
  {
    id: 'app.revealConfig',
    group: 'App',
    label: 'Open config file',
    icon: '⊞',
    run: ctx => void ctx.app.revealConfig(),
  },
  {
    id: 'app.reload',
    group: 'App',
    label: 'Reload window',
    icon: '↻',
    keys: { key: 'i', meta: true, alt: true },
    run: () => location.reload(),
  },
  {
    id: 'app.quit',
    group: 'App',
    label: 'Quit vdoc',
    icon: '⏻',
    keys: { key: 'q', meta: true },
    run: ctx => void ctx.app.quit(),
  },
]

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
  caps.push(keys.key === 'Escape' ? 'esc' : keys.key.length === 1 ? keys.key.toUpperCase() : keys.key)
  return caps
}

/** Flat form for tooltips and menu rows - `⌘⇧R` / `Ctrl+Shift+R`. */
export function shortcutLabel(id: string): string {
  return keycaps(command(id).keys).join(IS_MAC ? '' : '+')
}

/** `Sync: Check this file` - the palette label, also used for fuzzy matching. */
export function fullLabel(cmd: Command): string {
  return `${cmd.group}: ${cmd.label}`
}

function matches(keys: KeyBinding, event: KeyboardEvent): boolean {
  // `meta` means the platform's primary modifier; the other one must stay unpressed.
  const otherMod = IS_MAC ? event.ctrlKey : event.metaKey
  return event.key.toLowerCase() === keys.key.toLowerCase()
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
