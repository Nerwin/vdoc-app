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
  error?: string
}

export interface ScanFile {
  path: string
  tracked: boolean
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

export interface Settings {
  theme: 'dark' | 'light'
  /** Explicit vdoc binary path; null = auto-detect (~/.bun/bin/vdoc, then PATH). */
  vdocBin: string | null
}

export interface SettingsInfo extends Settings {
  resolvedBin: string
  /** `vdoc --version` output, null when the binary cannot be run. */
  version: string | null
}

export interface VdocApi {
  scan(): Promise<ScanResult>
  checkAll(): Promise<CheckFile[]>
  checkFiles(paths: string[]): Promise<CheckFile[]>
  readFile(path: string): Promise<string>
  diff(path: string): Promise<DiffResult>
  pull(paths: string[], force?: boolean): Promise<PullFile[]>
  push(path: string, dryRun: boolean, force?: boolean): Promise<PushFile[]>
  create(path: string, space: string, parent?: string): Promise<CreateResult>
  sync(path: string): Promise<SyncFile[]>
  lint(path: string): Promise<LintFile[]>
  authStatus(): Promise<AuthStatus>
  setToken(token: string): Promise<AuthStatus>
  openConfluence(path: string): Promise<void>
  openEditor(path: string): Promise<void>
  revealFinder(path: string): Promise<void>
  settingsGet(): Promise<SettingsInfo>
  settingsSet(patch: Partial<Settings>): Promise<SettingsInfo>
  vdocVersion(): Promise<string | null>
  onFilesChanged(cb: (paths: string[]) => void): () => void
  onCheckProgress(cb: (progress: CheckProgress) => void): () => void
}
