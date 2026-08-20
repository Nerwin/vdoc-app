/** JSON shapes returned by the vdoc CLI (`--json`), plus the IPC api surface. */

export type SyncState =
  | 'in-sync'
  | 'behind'
  | 'ahead'
  | 'local-edits'
  | 'conflict'
  | 'no-version'
  | 'not-found'
  | 'untracked'

/** UI-level state: CLI states plus two app-derived ones. */
export type DisplayState = SyncState | 'unverified' | 'unchecked'

/** One shared tree filter driving the sidebar chips and the status-bar counters. */
export type TriageFilter = 'attention' | 'behind' | 'unverified' | 'dirty' | null

export interface CheckFile {
  file: string
  state: SyncState
  pageId?: string
  localVersion?: number
  remoteVersion?: number
  localEdits?: boolean
  titleMismatch?: boolean
  summary?: string
}

export interface DiffResult {
  pageId: string
  file: string
  identical: boolean
  patch: string
  local: string
  remote: string
  localVersion?: number
  remoteVersion: number
  versionDrift: boolean
  baselineRecorded?: boolean
}

export interface VersionEntry {
  number: number
  createdAt: string
  author: string
}

export interface CommentEntry {
  id: string
  kind: 'footer' | 'inline'
  author: string
  authorId: string
  createdAt: string
  resolutionStatus?: string
  /** The inline comment's highlighted text on the page, when available. */
  selection?: string
  markdown: string
}

export interface PullFile {
  file: string
  status: string
  pageId?: string
  localVersion?: number
  remoteVersion?: number
  summary?: string
}

export interface PushFile {
  file: string
  pageId: string
  version: number
  dryRun?: boolean
  resolvedLinks?: number
  unresolvedLinks?: number
}

export interface SyncFile {
  file: string
  status: 'linked' | 'already-linked' | 'not-found' | 'ambiguous' | 'skipped'
  title?: string
  pageId?: string
  space?: string
  version?: number
  matchCount?: number
  reason?: string
}

export interface CreateResult {
  file: string
  title: string
  space: string
  pageId?: string
  version?: number
  dryRun?: boolean
}

export interface GetPageResult {
  pageId: string
  title: string
  version: number
  /** Written path, relative to the docs root (the CLI runs with cwd there). */
  file?: string
  opaqueNodes: number
  mermaidDiagrams: number
  localizedLinks?: number
}

export interface LintIssue {
  rule: string
  severity: string
  message: string
}

export interface LintFile {
  file: string
  issues: LintIssue[]
}

export interface AuthStatus {
  ok: boolean
  method: 'api-token' | 'session-token' | 'none'
  displayName?: string
  /** Session token JWT expiry, epoch seconds. */
  tokenExp?: number
  /** An API key is stored in the config (regardless of the active method). */
  hasApiKey: boolean
  email?: string
  error?: string
}

export interface ScanFile {
  path: string
  tracked: boolean
  /** Has uncommitted git changes (purely informational — no sync logic depends on it). */
  gitDirty: boolean
}

export interface ScanResult {
  root: string
  files: ScanFile[]
}

export interface CheckProgress {
  done: number
  total: number
  results: CheckFile[]
}

/** Ring-buffer size of the CLI invocation log (kept in main, mirrored in the renderer). */
export const LOG_MAX = 200

/** One spawned CLI invocation, as recorded by the main process (secrets redacted). */
export interface VdocLogEntry {
  id: number
  /** Epoch ms when the command started. */
  at: number
  /** argv after the binary — credential values are replaced with •••. */
  args: string[]
  exitCode: number
  durationMs: number
  /** First 8KB of stdout; hidden entirely for commands that print credentials. */
  stdout: string
  /** Last 8KB of stderr — the CLI's human log lines. */
  stderr: string
}

export interface Settings {
  /** `system` follows the OS appearance; light/dark pin it. */
  theme: 'dark' | 'light' | 'system'
  /** Explicit vdoc binary path; null = auto-detect (~/.bun/bin/vdoc, then PATH). */
  vdocBin: string | null
  /** Absolute path of the docs repository; null = $VDOC_APP_ROOT, then the built-in default. */
  docsRoot: string | null
  /** Root folders (relative to the docs repo) shown in the tree. Only .md files are ever listed. */
  contentDirs: string[]
  /** Folder paths pinned to the top of their parent's listing. */
  pinnedDirs: string[]
}

export interface SettingsInfo extends Settings {
  resolvedBin: string
  /** The docs repository root actually in use. */
  resolvedRoot: string
  /** `vdoc --version` output, null when the binary cannot be run. */
  version: string | null
  /** This app's own version (package.json / bundle). */
  appVersion: string
  /** The .vdocrc actually in use — shared between the CLI and the app. */
  configPath: string | null
}

export interface VdocApi {
  scan(): Promise<ScanResult>
  checkAll(): Promise<CheckFile[]>
  /** Stop the running check-all after the current batch; checkAll resolves with partial results. */
  checkCancel(): Promise<void>
  checkFiles(paths: string[]): Promise<CheckFile[]>
  readFile(path: string): Promise<string>
  /** Overwrite a file inside the docs root — the in-app editor's save. */
  writeFile(path: string, content: string): Promise<void>
  /** Docs in the tree whose markdown links resolve to this file. */
  backlinks(path: string): Promise<string[]>
  /** Open an http(s) URL in the default browser. */
  openExternal(url: string): Promise<void>
  diff(path: string): Promise<DiffResult>
  recordBaseline(path: string): Promise<DiffResult>
  lastVersion(path: string): Promise<VersionEntry | null>
  comments(path: string): Promise<CommentEntry[]>
  postComment(path: string, text: string): Promise<void>
  /** Confluence label names on the page this tracked file maps to. */
  labels(path: string): Promise<string[]>
  pull(paths: string[], force?: boolean): Promise<PullFile[]>
  push(path: string, dryRun: boolean, force?: boolean): Promise<PushFile[]>
  create(path: string, space: string, parent?: string): Promise<CreateResult>
  /** Download a page (URL or id) into `dir`; the CLI names the file after the page title. */
  getPage(input: string, dir: string): Promise<GetPageResult>
  /** Tracked file whose frontmatter already carries this confluencePageId, or null. */
  fileForPageId(pageId: string): Promise<string | null>
  sync(path: string, space?: string): Promise<SyncFile[]>
  lint(path: string): Promise<LintFile[]>
  authStatus(): Promise<AuthStatus>
  setToken(token: string): Promise<AuthStatus>
  saveApiKey(email: string, apiToken: string): Promise<AuthStatus>
  setAuthMethod(method: 'api-token' | 'session-token'): Promise<AuthStatus>
  /** The page's Confluence URL — copy it, or open it via openExternal. */
  confluenceUrl(path: string): Promise<string>
  openEditor(path: string): Promise<void>
  revealFinder(path: string): Promise<void>
  settingsGet(): Promise<SettingsInfo>
  settingsSet(patch: Partial<Settings>): Promise<SettingsInfo>
  vdocVersion(): Promise<string | null>
  /** Native folder picker rooted at the docs repo; returns a relative path or null. */
  pickFolder(): Promise<string | null>
  /** Native folder picker for the docs repository itself; returns an absolute path or null. */
  pickDocsRoot(): Promise<string | null>
  openFolder(path: string): Promise<void>
  /** Folder → Confluence space mapping, stored in the shared .vdocrc. */
  spaceMappingGet(): Promise<Record<string, string>>
  /** Set (or delete with null) one mapping entry; returns the fresh mapping. */
  spaceMappingSet(dir: string, space: string | null): Promise<Record<string, string>>
  revealConfig(): Promise<void>
  quit(): Promise<void>
  /** All recorded CLI invocations, oldest first (ring buffer of the last 200). */
  logs(): Promise<VdocLogEntry[]>
  onFilesChanged(cb: (paths: string[]) => void): () => void
  onCheckProgress(cb: (progress: CheckProgress) => void): () => void
  onVdocLog(cb: (entry: VdocLogEntry) => void): () => void
}
