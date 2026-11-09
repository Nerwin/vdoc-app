import { randomUUID } from 'node:crypto'
import { readFileSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'

import type { Settings } from '../shared/types.ts'
import { atomicWriteFile } from './atomic-write.ts'

/** Docs repo fallback when neither the docsRoot setting nor $VDOC_APP_ROOT is set. */
export const DEFAULT_DOCS_ROOT = homedir()

/** Directory names never scanned or watched, wherever they appear in the tree. */
// ponytail: constant, not a Settings field - promote to Settings if another repo layout ever needs it.
export const EXCLUDED_DIRS = new Set(['Images', 'Private', 'Temp', '_audit', 'Scripts', 'node_modules', 'dist'])

const DEFAULTS: Settings = {
  theme: 'system',
  vdocBin: null,
  docsRoot: null,
  contentDirs: [],
  pinnedDirs: [],
  pinnedFiles: {},
  crashReports: false,
  installId: '',
}

const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')

// Settings only ever change through saveSettings in this process, so cache the
// parse - loadSettings is on the scan hot path (once per walked file).
let cache: Settings | null = null

export function loadSettings(): Settings {
  if (cache) return cache
  try {
    cache = { ...DEFAULTS, ...JSON.parse(readFileSync(settingsFile(), 'utf8')) as Partial<Settings> }
  } catch (error) {
    // Keep an unreadable file aside instead of overwriting it with defaults.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      try {
        renameSync(settingsFile(), `${settingsFile()}.corrupt`)
      } catch {
        // Nothing left to preserve.
      }
    }
    cache = { ...DEFAULTS }
  }
  if (!cache.installId) {
    cache.installId = randomUUID()
    saveSettings(cache)
  }
  return cache
}

export function saveSettings(settings: Settings): void {
  cache = settings
  atomicWriteFile(settingsFile(), JSON.stringify(settings, null, 2))
}
