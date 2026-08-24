import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'

import type { Settings } from '../shared/types.ts'

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
  crashReports: true,
}

const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')

// Settings only ever change through saveSettings in this process, so cache the
// parse - loadSettings is on the scan hot path (once per walked file).
let cache: Settings | null = null

export function loadSettings(): Settings {
  if (cache) return cache
  try {
    cache = { ...DEFAULTS, ...JSON.parse(readFileSync(settingsFile(), 'utf8')) as Partial<Settings> }
  } catch {
    cache = { ...DEFAULTS }
  }
  return cache
}

export function saveSettings(settings: Settings): void {
  cache = settings
  writeFileSync(settingsFile(), JSON.stringify(settings, null, 2))
}
