import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

import type { Settings } from '../shared/types.ts'

const DEFAULTS: Settings = { theme: 'dark', vdocBin: null }

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
