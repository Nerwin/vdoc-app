import { execFile, execFileSync } from 'node:child_process'
import { closeSync, existsSync, fstatSync, openSync, readdirSync, readSync, realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { BrowserWindow } from 'electron'

import { LOG_MAX, type RepoSettings, type VdocLogEntry } from '../shared/types.ts'
import { mdLinkTargets, resolveRelative } from '../shared/links.ts'
import { parseFrontmatter } from '../shared/frontmatter.ts'
import { relativeAppPath, resolveExistingPathInsideRoot, resolvePathInsideRoot } from '../shared/path-policy.ts'
import { joinRepoPath, splitRepoPath } from '../shared/repo-path.ts'
import { firstMatch, type SearchHit } from '../shared/search.ts'
import { parseGitStatus } from '../shared/git-status.ts'
import { hidesVdocOutput, redactVdocArgs, vdocCommandId } from '../shared/privacy.ts'
import { EXCLUDED_DIRS, loadSettings, repoByAlias } from './settings.ts'
import { logAppEvent } from './sentry.ts'

/** Configured repositories whose root folder exists - the only ones scanned, watched or run against. */
export function availableRepos(): RepoSettings[] {
  return loadSettings().repos.filter(repo => existsSync(repo.root))
}

export interface RepoPath {
  repo: RepoSettings
  /** Path inside the repository, `/`-separated; '' is the root itself. */
  rel: string
  abs: string
}

/**
 * `<alias>/<rel>` → the configured repository and the existing absolute path inside it.
 * Unknown aliases are refused before any filesystem access; the bare alias (the root) only with `allowRoot`.
 */
export function resolveAppPath(value: unknown, label = 'path', allowRoot = false): RepoPath {
  const { alias, rel } = splitRepoPath(relativeAppPath(value, label))
  const repo = repoByAlias(alias)
  if (!repo || (rel === '' && !allowRoot)) throw new Error(`Invalid ${label}`)
  return { repo, rel, abs: rel === '' ? realpathSync(repo.root) : resolveExistingPathInsideRoot(repo.root, rel, label) }
}

// Bun's global bin dir on every OS; on Windows bun writes vdoc.exe shims.
const bunBin = join(homedir(), '.bun', 'bin')

const defaultBin = (): string => {
  const candidate = join(bunBin, process.platform === 'win32' ? 'vdoc.exe' : 'vdoc')
  return existsSync(candidate) ? candidate : 'vdoc'
}

/**
 * GUI-launched apps (Finder, GNOME shell) get a minimal environment, so exports like
 * VDOC_ENCRYPTION_KEY never reach the spawned CLI - import the login shell's env once
 * at startup (existing vars win). Windows GUI apps inherit the user env: skip.
 */
export function importLoginShellEnv(): void {
  if (process.platform === 'win32') return
  if (process.env.VDOC_ENCRYPTION_KEY) return // launched from a shell - env already complete
  const shell = process.env.SHELL ?? '/bin/zsh'
  try {
    // -i so rc files (where user exports live) are sourced.
    const output = execFileSync(shell, ['-ilc', 'printenv'], { encoding: 'utf8', timeout: 5000 })
    for (const line of output.split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0 && !(line.slice(0, eq) in process.env)) process.env[line.slice(0, eq)] = line.slice(eq + 1)
    }
  } catch {
    // No usable shell or probe timed out: keep the env as-is; runVdoc's PATH fallback still applies.
  }
}

let configuredBin: string | null = null

/** Override the vdoc binary (null = auto-detect). Set from settings at startup and on change. */
export function setVdocBin(bin: string | null): void {
  configuredBin = bin?.trim() || null
}

export function resolvedVdocBin(): string {
  return configuredBin ?? defaultBin()
}

export interface VdocRun {
  exitCode: number
  stdout: string
  stderr: string
  termination?: VdocTermination
}

export interface VdocRunOptions {
  signal?: AbortSignal
  timeoutMs?: number
  /** The repository the command runs in (cwd = its root, paths relative to it); global commands run from home. */
  repo?: RepoSettings
}

type VdocTermination = 'cancelled' | 'timeout'

export class VdocCancelledError extends Error {
  constructor(command: string) {
    super(`vdoc ${command} cancelled`)
    this.name = 'VdocCancelledError'
  }
}

const OUTPUT_CLIP = 8192
const DEFAULT_VDOC_TIMEOUT_MS = 10 * 60 * 1000
const FORCE_KILL_DELAY_MS = 5_000
const logEntries: VdocLogEntry[] = []
let logId = 0

/** Every CLI invocation this session, oldest first - feeds the Logs view. */
export function vdocLogs(): VdocLogEntry[] {
  return logEntries
}

/** A standalone copy - a V8 slice would keep the whole CLI output (up to maxBuffer) alive in the log. */
const detach = (text: string): string => Buffer.from(text, 'utf8').toString('utf8')

/** Sensitive values never reach the renderer's command log. */
function recordRun(args: string[], run: VdocRun, startedAt: number, repo: RepoSettings | undefined): void {
  const hideOutput = hidesVdocOutput(args)
  const entry: VdocLogEntry = {
    id: ++logId,
    at: startedAt,
    args: redactVdocArgs(args),
    ...(repo ? { repo: repo.alias } : {}),
    exitCode: run.exitCode,
    ...(run.termination ? { termination: run.termination } : {}),
    durationMs: Date.now() - startedAt,
    stdout: hideOutput ? '(hidden - output may contain sensitive data)' : detach(run.stdout.slice(0, OUTPUT_CLIP)),
    stderr: hideOutput ? '(hidden - output may contain sensitive data)' : detach(run.stderr.slice(-OUTPUT_CLIP)),
  }
  logEntries.push(entry)
  if (logEntries.length > LOG_MAX) logEntries.shift()
  logAppEvent('info', 'app.command.finished', {
    'command.name': vdocCommandId(args).replace(' ', '-'),
    'command.duration_ms': entry.durationMs,
    'command.exit_code': run.exitCode,
    // exit 3 = drift/findings, a normal result - not a failure
    'command.success': run.exitCode === 0 || run.exitCode === 3,
  })
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('vdoc-log', entry)
}

export function runVdoc(args: string[], options: VdocRunOptions = {}): Promise<VdocRun> {
  const startedAt = Date.now()
  return new Promise(resolve => {
    let termination: VdocTermination | undefined
    let forceKillTimer: NodeJS.Timeout | undefined
    const child = execFile(
      resolvedVdocBin(),
      args,
      {
        cwd: options.repo?.root ?? homedir(),
        env: {
          ...process.env,
          NO_COLOR: '1',
          FORCE_COLOR: '0',
          // The vdoc shebang is `#!/usr/bin/env bun`; a GUI-launched app has a
          // minimal PATH, so append the vdoc dir plus the standard user bin dirs
          // (bun itself may live in Homebrew, not next to the linked binary).
          PATH: [
            process.env.PATH,
            dirname(resolvedVdocBin()),
            bunBin,
            ...(process.platform === 'win32' ? [] : ['/opt/homebrew/bin', '/usr/local/bin']),
          ].filter(Boolean).join(delimiter),
        },
        maxBuffer: 64 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        clearTimeout(timeoutTimer)
        clearTimeout(forceKillTimer)
        options.signal?.removeEventListener('abort', cancel)
        const exitCode = termination === 'cancelled'
          ? 130
          : termination === 'timeout'
            ? 124
            : error
              ? ((error as NodeJS.ErrnoException & { code?: number | string }).code === 'ENOENT' ? -1 : (typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : 1))
              : 0
        const run: VdocRun = { exitCode, stdout, stderr, ...(termination ? { termination } : {}) }
        recordRun(args, run, startedAt, options.repo)
        resolve(run)
      },
    )

    const stop = (reason: VdocTermination): void => {
      if (termination) return
      termination = reason
      child.kill('SIGTERM')
      forceKillTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      }, FORCE_KILL_DELAY_MS)
      forceKillTimer.unref()
    }
    const cancel = (): void => stop('cancelled')
    const timeoutTimer = setTimeout(() => stop('timeout'), options.timeoutMs ?? DEFAULT_VDOC_TIMEOUT_MS)
    timeoutTimer.unref()
    options.signal?.addEventListener('abort', cancel, { once: true })
    if (options.signal?.aborted) cancel()
  })
}

/**
 * Run a vdoc command with --json and parse stdout. Non-zero exit with valid
 * data JSON is a normal findings result, not a failure.
 */
export async function runVdocJson<T>(args: string[], options: VdocRunOptions = {}): Promise<T> {
  const { exitCode, stdout, stderr, termination } = await runVdoc([...args, '--json'], options)

  if (termination === 'cancelled') throw new VdocCancelledError(vdocCommandId(args))
  if (termination === 'timeout') throw new Error(`vdoc ${vdocCommandId(args)} timed out`)

  if (exitCode === -1) {
    throw new Error('vdoc binary not found - is it linked (`bun link` in the vdoc repo)?')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    throw new Error(vdocFailureMessage(args, stderr, stdout))
  }

  // oclif --json failures print {"error": {"name", "message", "code"}} with a non-zero exit.
  if (exitCode !== 0 && parsed && typeof parsed === 'object' && 'error' in parsed) {
    const { message } = (parsed as { error: { message?: unknown } }).error ?? {}
    throw new Error(!hidesVdocOutput(args) && typeof message === 'string' ? message : vdocFailureMessage(args, stderr, stdout))
  }

  // oclif error JSON always carries a stack; data payloads never do.
  if (parsed && typeof parsed === 'object' && 'stack' in parsed && 'message' in parsed) {
    throw new Error(hidesVdocOutput(args) ? vdocFailureMessage(args, stderr, stdout) : String((parsed as { message: unknown }).message))
  }

  return parsed as T
}

function vdocFailureMessage(args: string[], stderr: string, stdout: string): string {
  const command = vdocCommandId(args)
  if (hidesVdocOutput(args)) return `vdoc ${command} failed; details hidden`
  const detail = (stderr || stdout).trim().split('\n').slice(-4).join('\n')
  return `vdoc ${command} failed${detail ? `:\n${detail}` : ''}`
}

/** Repo-relative paths of files with uncommitted git changes under the content dirs, or among `rels`. */
export function gitDirtyFiles(repo: RepoSettings, rels: string[] = repo.contentDirs): Set<string> {
  try {
    const git = (args: string[]): string => execFileSync('git', args, { cwd: repo.root, encoding: 'utf8' })
    const prefix = git(['rev-parse', '--show-prefix']).trim()
    return parseGitStatus(git(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...rels.map(rel => rel || '.')]), prefix)
  } catch {
    return new Set()
  }
}

interface FileMeta {
  tracked: boolean
  title?: string
  pageId?: string
  ignored?: boolean
  hidden?: boolean
  mtimeMs?: number
}

/** Repo-relative paths of all Markdown files in the content dirs - directory listings only, no file reads. */
function markdownPaths(repo: RepoSettings): string[] {
  const paths = new Set<string>()
  const walk = (relDir: string): void => {
    const absDir = join(repo.root, relDir)
    if (!existsSync(absDir)) return
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || EXCLUDED_DIRS.has(entry.name)) continue
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(relPath)
      else if (entry.name.endsWith('.md')) paths.add(relPath)
    }
  }
  for (const dir of repo.contentDirs) walk(dir)
  return [...paths]
}

/** All Markdown files of every available repository, as app paths; tracked = has confluencePageId frontmatter. */
export function scanMarkdownFiles(): Array<FileMeta & { path: string }> {
  return availableRepos().flatMap(repo => markdownPaths(repo).map(rel => ({ path: joinRepoPath(repo.alias, rel), ...fileMeta(join(repo.root, rel)) })))
}

/** Fresh metadata for known app paths - `null` once one is gone (or its repository), so the caller rescans everything. */
export function scanFiles(paths: string[]): Array<FileMeta & { path: string }> | null {
  const files: Array<FileMeta & { path: string }> = []
  for (const path of paths) {
    const { alias, rel } = splitRepoPath(path)
    const repo = repoByAlias(alias)
    if (!repo || rel === '') return null
    const abs = resolvePathInsideRoot(repo.root, rel)
    if (!existsSync(abs)) return null
    files.push({ path, ...fileMeta(abs) })
  }
  return files
}

/** Full-text search: first matching line per file, capped. Case-insensitive substring. */
// ponytail: full rescan per query (async, the renderer debounces) - an index if the corpus reaches thousands of large files.
export async function searchContent(query: string): Promise<SearchHit[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  const hits: SearchHit[] = []
  for (const repo of availableRepos()) {
    for (const rel of markdownPaths(repo)) {
      try {
        const match = firstMatch(await readFile(join(repo.root, rel), 'utf8'), trimmed)
        if (match) hits.push({ path: joinRepoPath(repo.alias, rel), ...match })
      } catch {
        // Unreadable file: no hit.
      }
      if (hits.length >= 50) return hits
    }
  }
  return hits
}

/** Docs of the same repository whose markdown links resolve to `target`. */
// ponytail: full rescan per call (async), no index - an index if the corpus reaches thousands of large files.
export async function backlinksTo(target: RepoPath): Promise<string[]> {
  const result: string[] = []
  const name = target.rel.split('/').at(-1)!
  for (const rel of markdownPaths(target.repo)) {
    if (rel === target.rel) continue
    try {
      const text = await readFile(join(target.repo.root, rel), 'utf8')
      // A link to the target spells its file name, plain or URI-encoded; most files are skipped without parsing.
      if (!text.includes(name) && !text.includes(encodeURI(name))) continue
      if (mdLinkTargets(text).some(href => resolveRelative(rel, href) === target.rel)) result.push(joinRepoPath(target.repo.alias, rel))
    } catch {
      // Unreadable file: not a backlink.
    }
  }
  return result
}

/** Tracked file whose frontmatter carries this confluencePageId - the first in repository order - or null. */
// ponytail: full rescan per call, same trade as backlinksTo.
export function fileForPageId(pageId: string): string | null {
  if (!/^\d+$/.test(pageId)) return null
  return scanMarkdownFiles().find(file => file.pageId === pageId)?.path ?? null
}

// ponytail: frontmatter regex approximates the CLI's parsePublishDoc; the CLI
// re-verifies on every command, so a miss only costs a stale badge.
function fileMeta(absPath: string): FileMeta {
  try {
    const file = openSync(absPath, 'r')
    const buffer = Buffer.allocUnsafe(8192)
    let head: string
    let mtimeMs: number
    try {
      const bytes = readSync(file, buffer, 0, buffer.length, 0)
      head = buffer.toString('utf8', 0, bytes)
      mtimeMs = fstatSync(file).mtimeMs
    } finally {
      closeSync(file)
    }
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(head)
    if (!frontmatter) return { tracked: false, mtimeMs }
    const { title, confluencePageId, confluenceIgnore, vdocHide } = parseFrontmatter(head)
    return {
      mtimeMs,
      tracked: /^confluencePageId\s*:/m.test(frontmatter[1]),
      title,
      pageId: confluencePageId,
      ignored: confluenceIgnore,
      hidden: vdocHide,
    }
  } catch {
    return { tracked: false }
  }
}
