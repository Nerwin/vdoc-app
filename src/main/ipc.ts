import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain, shell } from 'electron'

import type { AuthStatus, CheckFile, CommentEntry, CreateResult, DiffResult, LintFile, PullFile, PushFile, Settings, SettingsInfo, SyncFile, VersionEntry } from '../shared/types.ts'
import { DOCS_ROOT, gitDirtyFiles, resolvedVdocBin, runVdoc, runVdocJson, scanMarkdownFiles, setVdocBin } from './vdoc.ts'
import { loadSettings, saveSettings } from './settings.ts'

const CHECK_BATCH = 24

export function registerIpc(): void {
  ipcMain.handle('scan', () => {
    const dirty = gitDirtyFiles()
    const files = scanMarkdownFiles().map(file => ({ ...file, gitDirty: dirty.has(file.path) }))
    return { root: DOCS_ROOT, files }
  })

  ipcMain.handle('check-all', async event => {
    const tracked = scanMarkdownFiles().filter(file => file.tracked).map(file => file.path)
    const results: CheckFile[] = []
    for (let i = 0; i < tracked.length; i += CHECK_BATCH) {
      const batch = tracked.slice(i, i + CHECK_BATCH)
      const { files } = await runVdocJson<{ files: CheckFile[] }>(['cf', 'check', ...batch])
      results.push(...files)
      if (!event.sender.isDestroyed()) {
        event.sender.send('check-progress', {
          done: Math.min(i + CHECK_BATCH, tracked.length),
          total: tracked.length,
          results: files,
        })
      }
    }
    return results
  })

  ipcMain.handle('check-files', async (_event, paths: string[]) => {
    if (paths.length === 0) return []
    const { files } = await runVdocJson<{ files: CheckFile[] }>(['cf', 'check', ...paths])
    return files
  })

  ipcMain.handle('read-file', (_event, path: string) => readFileSync(join(DOCS_ROOT, path), 'utf8'))

  ipcMain.handle('diff', (_event, path: string) => runVdocJson<DiffResult>(['cf', 'diff', path]))

  ipcMain.handle('record-baseline', (_event, path: string) =>
    runVdocJson<DiffResult>(['cf', 'diff', path, '--record']))

  ipcMain.handle('last-version', async (_event, path: string) => {
    const { versions } = await runVdocJson<{ versions: VersionEntry[] }>(['cf', 'versions', path, '--limit', '1'])
    return versions[0] ?? null
  })

  ipcMain.handle('comments', async (_event, path: string) => {
    const { comments } = await runVdocJson<{ comments: CommentEntry[] }>(['cf', 'comments', path])
    return comments
  })

  ipcMain.handle('post-comment', async (_event, path: string, text: string) => {
    await runVdocJson(['cf', 'comment', path, text])
  })

  ipcMain.handle('pull', async (_event, paths: string[], force?: boolean) => {
    const args = ['cf', 'pull', ...paths]
    if (force) args.push('--force')
    const { files } = await runVdocJson<{ files: PullFile[] }>(args)
    return files
  })

  ipcMain.handle('push', async (_event, path: string, dryRun: boolean, force?: boolean) => {
    const args = ['cf', 'push', path]
    if (dryRun) args.push('--dry-run')
    if (force) args.push('--force')
    const { files } = await runVdocJson<{ files: PushFile[] }>(args)
    return files
  })

  ipcMain.handle('create', (_event, path: string, space: string, parent?: string) => {
    const args = ['cf', 'push', path, '--create', '--space', space]
    if (parent) args.push('--parent', parent)
    return runVdocJson<CreateResult>(args)
  })

  ipcMain.handle('sync', async (_event, path: string) => {
    const { files } = await runVdocJson<{ files: SyncFile[] }>(['cf', 'sync', path])
    return files
  })

  ipcMain.handle('lint', async (_event, path: string) => {
    const { files } = await runVdocJson<{ files: LintFile[] }>(['cf', 'lint', path])
    return files
  })

  ipcMain.handle('auth-status', () => authStatus())

  ipcMain.handle('set-token', async (_event, token: string) => {
    await runVdocJson(['config', 'set', 'confluence.sessionToken', '--encrypt', token.trim()])
    return authStatus()
  })

  ipcMain.handle('save-api-key', async (_event, email: string, apiToken: string) => {
    await runVdocJson(['config', 'set', 'confluence.email', email.trim()])
    await runVdocJson(['config', 'set', 'confluence.apiToken', '--encrypt', apiToken.trim()])
    await runVdocJson(['config', 'set', 'confluence.authMethod', 'api-token'])
    return authStatus()
  })

  ipcMain.handle('set-auth-method', async (_event, method: 'api-token' | 'session-token') => {
    await runVdocJson(['config', 'set', 'confluence.authMethod', method])
    return authStatus()
  })

  ipcMain.handle('open-confluence', async (_event, path: string) => {
    const { url } = await runVdocJson<{ url: string }>(['cf', 'open', path, '--print'])
    await shell.openExternal(url)
  })

  ipcMain.handle('open-editor', async (_event, path: string) => {
    const error = await shell.openPath(join(DOCS_ROOT, path))
    if (error) throw new Error(error)
  })

  ipcMain.handle('reveal-finder', (_event, path: string) => {
    shell.showItemInFolder(join(DOCS_ROOT, path))
  })

  ipcMain.handle('settings-get', () => settingsInfo())

  ipcMain.handle('settings-set', (_event, patch: Partial<Settings>) => {
    const settings = { ...loadSettings(), ...patch }
    saveSettings(settings)
    setVdocBin(settings.vdocBin)
    return settingsInfo()
  })

  ipcMain.handle('vdoc-version', () => probeVersion())
}

async function settingsInfo(): Promise<SettingsInfo> {
  return { ...loadSettings(), resolvedBin: resolvedVdocBin(), version: await probeVersion(), appVersion: app.getVersion() }
}

/** First stdout line of `vdoc --version`, or null when the binary is unusable. */
async function probeVersion(): Promise<string | null> {
  const { exitCode, stdout } = await runVdoc(['--version'])
  if (exitCode !== 0) return null
  return stdout.trim().split('\n')[0] || null
}

interface ConfluenceConfig {
  apiToken?: string
  sessionToken?: string
  authMethod?: 'api-token' | 'session-token'
  email?: string
}

/** Probe credentials via whoami; tokens themselves never leave the main process. */
async function authStatus(): Promise<AuthStatus> {
  const config = await runVdocJson<ConfluenceConfig>(['config', 'get', 'confluence', '--decrypt'])
    .catch(() => ({}) as ConfluenceConfig)

  // Mirror the CLI's resolution: an explicit session-token preference skips the stored API key.
  const method: AuthStatus['method'] = config.authMethod === 'session-token'
    ? (config.sessionToken ? 'session-token' : 'none')
    : config.apiToken
      ? 'api-token'
      : config.sessionToken ? 'session-token' : 'none'
  const tokenExp = method === 'session-token' && config.sessionToken ? decodeJwtExp(config.sessionToken) : undefined
  const base = { method, tokenExp, hasApiKey: Boolean(config.apiToken), email: config.email }

  if (method === 'none') return { ok: false, ...base, error: 'No Confluence credentials configured' }

  try {
    const whoami = await runVdocJson<{ displayName: string }>(['cf', 'whoami'])
    return { ok: true, ...base, displayName: whoami.displayName }
  } catch (error) {
    return { ok: false, ...base, error: error instanceof Error ? error.message : String(error) }
  }
}

function decodeJwtExp(token: string): number | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { exp?: number }
    return payload.exp
  } catch {
    return undefined
  }
}
