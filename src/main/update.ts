import { app, type BrowserWindow } from 'electron'
import electronUpdater, { type AppUpdater } from 'electron-updater'

import type { AppUpdateStatus } from '../shared/types.ts'

const STARTUP_DELAY_MS = 10_000
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

let initialized = false
let updater: AppUpdater | null = null
let windowProvider: (() => BrowserWindow | null) | null = null
let checkPromise: Promise<AppUpdateStatus> | null = null
let status: AppUpdateStatus = { phase: 'idle', current: app.getVersion() }

function getAutoUpdater(): AppUpdater {
  const { autoUpdater } = electronUpdater
  return autoUpdater
}

function setStatus(next: AppUpdateStatus): void {
  status = next
  const window = windowProvider?.()
  if (window && !window.isDestroyed()) window.webContents.send('update-status', next)
}

function versionStatus(
  phase: AppUpdateStatus['phase'],
  latest?: string,
  progress?: number,
): AppUpdateStatus {
  return {
    phase,
    current: app.getVersion(),
    ...(latest ? { latest } : {}),
    ...(progress === undefined ? {} : { progress }),
  }
}

export function initializeUpdater(getMainWindow: () => BrowserWindow | null): void {
  if (initialized) return
  initialized = true
  windowProvider = getMainWindow

  if (!app.isPackaged || process.argv.includes('--smoke-test')) {
    setStatus(versionStatus('unsupported'))
    return
  }

  updater = getAutoUpdater()
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  updater.allowPrerelease = false
  updater.disableWebInstaller = true
  updater.logger = null

  updater.on('checking-for-update', () => setStatus(versionStatus('checking')))
  updater.on('update-not-available', () => setStatus(versionStatus('current')))
  updater.on('update-available', info => setStatus(versionStatus('available', info.version)))
  updater.on('download-progress', info => {
    const progress = Math.max(0, Math.min(100, Math.round(info.percent)))
    setStatus(versionStatus('downloading', status.latest, progress))
  })
  updater.on('update-downloaded', info => setStatus(versionStatus('downloaded', info.version, 100)))
  updater.on('error', () => setStatus(versionStatus('error', status.latest)))

  const startupTimer = setTimeout(() => void checkForUpdates(true), STARTUP_DELAY_MS)
  const interval = setInterval(() => void checkForUpdates(true), CHECK_INTERVAL_MS)
  app.once('before-quit', () => {
    clearTimeout(startupTimer)
    clearInterval(interval)
  })
}

export function getUpdateStatus(): AppUpdateStatus {
  return status
}

export function checkForUpdates(notify = false): Promise<AppUpdateStatus> {
  const activeUpdater = updater
  if (!activeUpdater || !activeUpdater.isUpdaterActive()) {
    setStatus(versionStatus('unsupported'))
    return Promise.resolve(status)
  }
  if (status.phase === 'available' || status.phase === 'downloading' || status.phase === 'downloaded') {
    return Promise.resolve(status)
  }
  if (checkPromise) return checkPromise

  checkPromise = (async () => {
    try {
      if (notify) await activeUpdater.checkForUpdatesAndNotify()
      else await activeUpdater.checkForUpdates()
      if (status.phase === 'checking') setStatus(versionStatus('current'))
    } catch {
      setStatus(versionStatus('error', status.latest))
    }
    return status
  })().finally(() => {
    checkPromise = null
  })

  return checkPromise
}

export function restartAndInstallUpdate(): void {
  const activeUpdater = updater
  if (!activeUpdater || status.phase !== 'downloaded') throw new Error('No downloaded update is ready')
  setImmediate(() => activeUpdater.quitAndInstall(false, true))
}
