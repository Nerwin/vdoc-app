import { randomUUID } from 'node:crypto'
import { readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

import type { RepoSettings, Settings } from '../shared/types.ts'
import { atomicWriteFile } from './atomic-write.ts'

/** Directory names never scanned or watched, wherever they appear in the tree. */
// ponytail: constant, not a Settings field - promote to Settings if another repo layout ever needs it.
export const EXCLUDED_DIRS = new Set(['Images', 'Private', 'Temp', '_audit', 'Scripts', 'node_modules', 'dist'])

const DEFAULTS: Settings = {
  theme: 'system',
  vdocBin: null,
  repos: [],
  crashReports: false,
  installId: '',
}

const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')

// Settings only ever change through saveSettings in this process, so cache the
// parse - loadSettings is on the scan hot path (once per walked file).
let cache: Settings | null = null

export function loadSettings(): Settings {
  if (cache) return cache
  let unreadable = false
  try {
    cache = { ...DEFAULTS, ...JSON.parse(readFileSync(settingsFile(), 'utf8')) as Partial<Settings> }
    cache.repos = repoList(cache.repos)
  } catch (error) {
    // Keep an unreadable file aside instead of overwriting it with defaults.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      try {
        renameSync(settingsFile(), `${settingsFile()}.corrupt`)
      } catch (renameError) {
        unreadable = (renameError as NodeJS.ErrnoException).code !== 'ENOENT'
      }
    }
    cache = { ...DEFAULTS }
  }
  if (!cache.installId) {
    cache.installId = randomUUID()
    // A file that could not be moved aside is left as is until the user saves a setting.
    if (!unreadable) saveSettings(cache)
  }
  return cache
}

/** settings.json is hand-edited: an entry may omit its lists; one without alias or root, or repeating an alias, is dropped. */
function repoList(value: unknown): RepoSettings[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return (value as Array<Partial<RepoSettings>>).flatMap(entry => {
    if (typeof entry?.alias !== 'string' || typeof entry.root !== 'string' || seen.has(entry.alias)) return []
    seen.add(entry.alias)
    return [{ alias: entry.alias, root: entry.root, contentDirs: entry.contentDirs ?? [], pinnedDirs: entry.pinnedDirs ?? [], pinnedFiles: entry.pinnedFiles ?? [] }]
  })
}

export function repoByAlias(alias: string): RepoSettings | undefined {
  return loadSettings().repos.find(repo => repo.alias === alias)
}

export function saveSettings(settings: Settings): void {
  cache = settings
  atomicWriteFile(settingsFile(), JSON.stringify(settings, null, 2))
}
