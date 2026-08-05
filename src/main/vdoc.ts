import { execFile, execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { loadSettings } from './settings.ts'

export const DOCS_ROOT = process.env.VDOC_APP_ROOT ?? join(homedir(), 'Projects/documentation/Vosker-doc')

/** User-configured root folders (Settings → Folders). */
export function getContentDirs(): string[] {
  return loadSettings().contentDirs
}

const EXCLUDED_DIRS = new Set(['0-Archives', '0-Images', '0-Private', 'Temp', '_audit', 'Scripts', 'node_modules', 'dist'])

// ponytail: PATH resolution only works when launched from a shell; packaged
// Finder launches would need a login-shell PATH probe.
const defaultBin = (): string => (existsSync(join(homedir(), '.bun/bin/vdoc')) ? join(homedir(), '.bun/bin/vdoc') : 'vdoc')

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
        cwd: DOCS_ROOT,
        env: {
          ...process.env,
          NO_COLOR: '1',
          FORCE_COLOR: '0',
          // The vdoc shebang is `#!/usr/bin/env bun`; a Finder-launched .app has a
          // minimal PATH, so append the vdoc dir plus the standard user bin dirs
          // (bun itself may live in Homebrew, not next to the linked binary).
          PATH: [
            process.env.PATH,
            dirname(resolvedVdocBin()),
            join(homedir(), '.bun/bin'),
            '/opt/homebrew/bin',
            '/usr/local/bin',
          ].filter(Boolean).join(':'),
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
      { cwd: DOCS_ROOT, encoding: 'utf8' },
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

  const walk = (relDir: string): void => {
    const absDir = join(DOCS_ROOT, relDir)
    if (!existsSync(absDir)) return
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || EXCLUDED_DIRS.has(entry.name)) continue
      const relPath = `${relDir}/${entry.name}`
      if (entry.isDirectory()) walk(relPath)
      else if (entry.name.endsWith('.md')) files.push({ path: relPath, tracked: isTracked(join(DOCS_ROOT, relPath)) })
    }
  }

  for (const dir of getContentDirs()) walk(dir)
  return files
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
