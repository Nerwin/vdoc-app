/** JSON shapes returned by the vdoc CLI (`--json`), plus the IPC api surface. */

import type { SearchHit } from './search.ts'
import type { VdocCliRequirement } from './app-config.ts'

type SyncState =
  | 'in-sync'
  | 'behind'
  | 'ahead'
  | 'local-edits'
  | 'conflict'
  | 'no-version'
  | 'not-found'
  | 'untracked'

/** UI-level state: CLI states plus three app-derived ones. */
export type DisplayState = SyncState | 'unverified' | 'unchecked' | 'ignored'

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

interface PushPreviewTicket {
  token: string
  result: PushFile
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

interface InitFileResult {
  file: string
  /** Frontmatter keys written by `vdoc md init`. */
  added: string[]
  /** Candidate keys already present and left unchanged. */
  skipped: string[]
}

export interface InitResult {
  files: InitFileResult[]
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

interface LintIssue {
  rule: string
  severity: string
  message: string
}

export interface LintFile {
  file: string
  issues: LintIssue[]
}

export interface AppUpdateStatus {
  phase: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'downloaded' | 'error' | 'unsupported'
  current: string
  latest?: string
  progress?: number
}

/** The two secrets stored in the CLI config file. */
export type CredentialKey = 'apiToken' | 'sessionToken'

export interface ConfluenceSpace {
  id: string
  key: string
  name: string
}

export interface AuthStatus {
  ok: boolean
  method: 'api-token' | 'session-token' | 'none'
  displayName?: string
  /** Session token JWT expiry, epoch seconds. */
  tokenExp?: number
  /** An API key is stored in the config (regardless of the active method). */
  hasApiKey: boolean
  /** A session token is stored in the config (regardless of the active method). */
  hasSessionToken: boolean
  /** Spaces returned by `vdoc cf whoami` for the active credentials. */
  spaces: ConfluenceSpace[]
  error?: string
}

export interface ScanFile {
  path: string
  tracked: boolean
  /** Has uncommitted git changes (purely informational - no sync logic depends on it). */
  gitDirty: boolean
  /** Frontmatter `title:` - the display name in the sidebar; filename when absent. */
  title?: string
  /** Frontmatter `confluencePageId:` value, when present. */
  pageId?: string
  /** Frontmatter `confluenceIgnore: true` - the file is skipped by every Confluence operation. */
  ignored?: boolean
}

interface ScanResult {
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
  /** argv after the binary - credential values are replaced with •••. */
  args: string[]
  exitCode: number
  durationMs: number
  /** First 8KB of stdout; hidden entirely for commands that print credentials. */
  stdout: string
  /** Last 8KB of stderr - the CLI's human log lines. */
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
  /** Send privacy-filtered error/crash reports to Sentry. Change takes effect on restart. */
  crashReports: boolean
}

export interface SettingsInfo extends Settings {
  resolvedBin: string
  /** The docs repository root actually in use. */
  resolvedRoot: string
  /** `vdoc --version` output, null when the binary cannot be run. */
  version: string | null
  /** Release-owned compatibility requirement from package.json; null when not configured. */
  cliRequirement: VdocCliRequirement | null
  /** This app's own version (package.json / bundle). */
  appVersion: string
  /** The CLI config file in use - shared between the CLI and the app. */
  configPath: string | null
  /** confluence.assetsDir from the CLI config file - null = CLI default ("assets"). */
  assetsDir: string | null
  /** confluence.site from the CLI config file (bare hostname, e.g. "your-org.atlassian.net"). */
  site: string | null
}

export interface FileWriteRequest {
  path: string
  expected: string
  next: string
  revision: number
}

export interface FileWriteResult {
  revision: number
}

export interface VdocApi {
  platform: 'darwin' | 'win32' | 'linux'
  scan(): Promise<ScanResult>
  checkAll(): Promise<CheckFile[]>
  /** Terminate the active check batch; checkAll resolves with completed batch results. */
  checkCancel(): Promise<void>
  checkFiles(paths: string[]): Promise<CheckFile[]>
  readFile(path: string): Promise<string>
  /** Write only when the file still matches the content previously read. */
  writeFile(request: FileWriteRequest): Promise<FileWriteResult>
  /** Docs in the tree whose markdown links resolve to this file. */
  backlinks(path: string): Promise<string[]>
  /** Full-text search over the content dirs - first matching line per file. */
  searchContent(query: string): Promise<SearchHit[]>
  /** Open an http(s) URL in the default browser. */
  openExternal(url: string): Promise<void>
  diff(path: string): Promise<DiffResult>
  recordBaseline(path: string): Promise<DiffResult>
  lastVersion(path: string): Promise<VersionEntry | null>
  comments(path: string): Promise<CommentEntry[]>
  postComment(path: string, text: string): Promise<void>
  /** Confluence label names on the page this tracked file maps to. */
  labels(path: string): Promise<string[]>
  pull(paths: string[], force?: boolean): Promise<PullFile[] | null>
  previewPush(path: string, force?: boolean): Promise<PushPreviewTicket>
  commitPush(token: string): Promise<PushFile | null>
  create(path: string, space: string, parent?: string): Promise<CreateResult>
  /** Add missing authoring frontmatter through `vdoc md init`; existing values are preserved. */
  initFile(path: string): Promise<InitResult>
  /** Download a page (URL or id) into `dir`; the CLI names the file after the page title. */
  getPage(input: string, dir: string): Promise<GetPageResult>
  /** Tracked file whose frontmatter already carries this confluencePageId, or null. */
  fileForPageId(pageId: string): Promise<string | null>
  sync(path: string, space?: string): Promise<SyncFile[]>
  lint(path: string): Promise<LintFile[]>
  authStatus(): Promise<AuthStatus>
  setToken(token: string): Promise<AuthStatus>
  saveApiKey(apiToken: string): Promise<AuthStatus>
  setAuthMethod(method: 'api-token' | 'session-token'): Promise<AuthStatus>
  /** Masked stored credential (first 4 + last 4 chars), or null when none is set. */
  credentialPreview(key: CredentialKey): Promise<string | null>
  /** Remove a stored credential (`config set` with an empty string). */
  clearCredential(key: CredentialKey): Promise<AuthStatus>
  /** The page's Confluence URL - copy it, or open it via openExternal. */
  confluenceUrl(path: string): Promise<string>
  openEditor(path: string): Promise<void>
  revealFinder(path: string): Promise<void>
  settingsGet(): Promise<SettingsInfo>
  settingsSet(patch: Partial<Settings>): Promise<SettingsInfo>
  /** Set (or clear with null) confluence.assetsDir in the CLI config file. */
  setAssetsDir(dir: string | null): Promise<SettingsInfo>
  /** Set (or clear with null) confluence.site in the CLI config file. */
  setSite(site: string | null): Promise<SettingsInfo>
  vdocVersion(): Promise<string | null>
  updateStatus(): Promise<AppUpdateStatus>
  checkUpdate(): Promise<AppUpdateStatus>
  installUpdate(): Promise<void>
  /** True when the main process initialized Sentry - the renderer inits its side only then. */
  sentryActive(): Promise<boolean>
  /** Native folder picker rooted at the docs repo; returns a relative path or null. */
  pickFolder(): Promise<string | null>
  /** Pick and apply the docs repository root; returns fresh settings or null when cancelled. */
  pickDocsRoot(): Promise<SettingsInfo | null>
  openFolder(path: string): Promise<void>
  /** Folder → Confluence space mapping, stored in the shared config file. */
  spaceMappingGet(): Promise<Record<string, string>>
  /** Set (or delete with null) one mapping entry; returns the fresh mapping. */
  spaceMappingSet(dir: string, space: string | null): Promise<Record<string, string>>
  revealConfig(): Promise<void>
  /** Open the CLI config file in the OS default editor. */
  editConfig(): Promise<void>
  /** Complete a main-process close request after pending editor saves settle. */
  closeReady(saved: boolean): Promise<void>
  quit(): Promise<void>
  /** All recorded CLI invocations, oldest first (ring buffer of the last 200). */
  logs(): Promise<VdocLogEntry[]>
  onFilesChanged(cb: (paths: string[]) => void): () => void
  onCheckProgress(cb: (progress: CheckProgress) => void): () => void
  onUpdateStatus(cb: (status: AppUpdateStatus) => void): () => void
  onVdocLog(cb: (entry: VdocLogEntry) => void): () => void
  onCloseRequested(cb: () => void): () => void
}
