import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

import type { Settings } from '../shared/types.ts'

const DEFAULTS: Settings = {
  theme: 'system',
  vdocBin: null,
  contentDirs: ['1-Backend', '2-DDA', '3-Projects'],
  pinnedDirs: [],
}

const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(settingsFile(), 'utf8')) as Partial<Settings> }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings: Settings): void {
  writeFileSync(settingsFile(), JSON.stringify(settings, null, 2))
}
