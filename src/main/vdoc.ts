import { execFile, execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'

import { mdLinkTargets, resolveRelative } from '../shared/links.ts'
import { loadSettings } from './settings.ts'

const DEFAULT_ROOT = process.env.VDOC_APP_ROOT ?? join(homedir(), 'Projects', 'documentation', 'Vosker-doc')

/** The docs repository root: Settings → VDOC_APP_ROOT → the historical default. */
export function docsRoot(): string {
  return loadSettings().docsRoot ?? DEFAULT_ROOT
}

/** User-configured root folders (Settings → Folders). */
export function getContentDirs(): string[] {
  return loadSettings().contentDirs
}

const EXCLUDED_DIRS = new Set(['0-Archives', '0-Images', '0-Private', 'Temp', '_audit', 'Scripts', 'node_modules', 'dist'])

// Bun's global bin dir on every OS; on Windows bun writes vdoc.exe shims.
const bunBin = join(homedir(), '.bun', 'bin')

const defaultBin = (): string => {
  const candidate = join(bunBin, process.platform === 'win32' ? 'vdoc.exe' : 'vdoc')
  return existsSync(candidate) ? candidate : 'vdoc'
}

/**
 * GUI-launched apps (Finder, GNOME shell) get a minimal environment, not the
 * login shell's, so exports like VDOC_ENCRYPTION_KEY never reach the spawned
 * CLI. Import the login-shell environment once at startup; existing vars are
 * never overridden. Windows GUI apps inherit the user environment — skip.
 */
export function importLoginShellEnv(): void {
  if (process.platform === 'win32') return
  if (process.env.VDOC_ENCRYPTION_KEY) return // launched from a shell — env already complete
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
}

export function runVdoc(args: string[]): Promise<VdocRun> {
  return new Promise(resolve => {
    execFile(
      resolvedVdocBin(),
      args,
      {
        cwd: docsRoot(),
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
        const exitCode = error ? ((error as NodeJS.ErrnoException & { code?: number | string }).code === 'ENOENT' ? -1 : (typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : 1)) : 0
        resolve({ exitCode, stdout, stderr })
      },
    )
  })
}

/**
 * Run a vdoc command with --json and parse stdout. Exit code 1 with valid
 * JSON is a normal "findings" result (drift, lint errors), not a failure.
 */
export async function runVdocJson<T>(args: string[]): Promise<T> {
  const { exitCode, stdout, stderr } = await runVdoc([...args, '--json'])

  if (exitCode === -1) {
    throw new Error('vdoc binary not found — is it linked (`bun link` in the vdoc repo)?')
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
    throw new Error(typeof message === 'string' ? message : vdocFailureMessage(args, stderr, stdout))
  }

  // oclif error JSON always carries a stack; data payloads never do.
  if (parsed && typeof parsed === 'object' && 'stack' in parsed && 'message' in parsed) {
    throw new Error(String((parsed as { message: unknown }).message))
  }

  return parsed as T
}

function vdocFailureMessage(args: string[], stderr: string, stdout: string): string {
  const detail = (stderr || stdout).trim().split('\n').slice(-4).join('\n')
  return `vdoc ${args.join(' ')} failed${detail ? `:\n${detail}` : ''}`
}

/** Relative paths of files with uncommitted git changes under the content dirs. */
export function gitDirtyFiles(): Set<string> {
  try {
    const output = execFileSync(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=all', '--', ...getContentDirs()],
      { cwd: docsRoot(), encoding: 'utf8' },
    )
    return new Set(
      output.split('\n')
        .filter(line => line.length > 3)
        // "XY path" — renames are "R  old -> new"; keep the new path.
        .map(line => line.slice(3).split(' -> ').at(-1) ?? '')
        .filter(Boolean),
    )
  } catch {
    return new Set()
  }
}

/** Relative paths of all Markdown files in the content dirs, tracked = has confluencePageId frontmatter. */
export function scanMarkdownFiles(): Array<{ path: string, tracked: boolean }> {
  const files: Array<{ path: string, tracked: boolean }> = []

  const root = docsRoot()
  const walk = (relDir: string): void => {
    const absDir = join(root, relDir)
    if (!existsSync(absDir)) return
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || EXCLUDED_DIRS.has(entry.name)) continue
      const relPath = `${relDir}/${entry.name}`
      if (entry.isDirectory()) walk(relPath)
      else if (entry.name.endsWith('.md')) files.push({ path: relPath, tracked: isTracked(join(root, relPath)) })
    }
  }

  for (const dir of getContentDirs()) walk(dir)
  return files
}

/** Docs under the content dirs whose markdown links resolve to `target`. */
// ponytail: full rescan per call, no index — the corpus is a few hundred small files.
export function backlinksTo(target: string): string[] {
  const result: string[] = []
  for (const { path } of scanMarkdownFiles()) {
    if (path === target) continue
    try {
      const text = readFileSync(join(docsRoot(), path), 'utf8')
      if (mdLinkTargets(text).some(href => resolveRelative(path, href) === target)) result.push(path)
    } catch {
      // Unreadable file: not a backlink.
    }
  }
  return result
}

/** Tracked file whose frontmatter carries this confluencePageId, or null. */
// ponytail: full rescan per call, same trade as backlinksTo.
export function fileForPageId(pageId: string): string | null {
  if (!/^\d+$/.test(pageId)) return null
  const idLine = new RegExp(`^confluencePageId\\s*:\\s*['"]?${pageId}['"]?\\s*$`, 'm')
  for (const { path, tracked } of scanMarkdownFiles()) {
    if (!tracked) continue
    try {
      const head = readFileSync(join(docsRoot(), path), 'utf8').slice(0, 2048)
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(head)
      if (frontmatter && idLine.test(frontmatter[1])) return path
    } catch {
      // Unreadable file: not a match.
    }
  }
  return null
}

// ponytail: frontmatter regex approximates the CLI's parsePublishDoc; the CLI
// re-verifies on every command, so a miss only costs a stale badge.
function isTracked(absPath: string): boolean {
  try {
    const head = readFileSync(absPath, 'utf8').slice(0, 2048)
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(head)
    return frontmatter ? /^confluencePageId\s*:/m.test(frontmatter[1]) : false
  } catch {
    return false
  }
}
