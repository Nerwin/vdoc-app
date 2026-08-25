import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'

import type { AuthStatus, CheckFile, CommentEntry, CreateResult, CredentialKey, DiffResult, FileWriteRequest, FileWriteResult, GetPageResult, InitResult, LintFile, PullFile, PushFile, Settings, SettingsInfo, SyncFile, VersionEntry } from '../shared/types.ts'
import { parseVdocCliRequirement, type VdocCliRequirement } from '../shared/app-config.ts'
import { parseConfluenceSpaces } from '../shared/confluence.ts'
import { isTrustedRendererLocation, PACKAGED_RENDERER_URL } from '../shared/electron-policy.ts'
import { contentForGuardedWrite } from '../shared/file-write.ts'
import { relativeAppPath, resolveExistingPathInsideRoot } from '../shared/path-policy.ts'
import { maskSecret } from '../shared/secret.ts'
import { OperationTickets } from '../shared/operation-tickets.ts'
import { atomicWriteFile } from './atomic-write.ts'
import { backlinksTo, docsRoot, fileForPageId, gitDirtyFiles, resolvedVdocBin, runVdoc, runVdocJson, scanMarkdownFiles, searchContent, setVdocBin, vdocLogs } from './vdoc.ts'
import { loadSettings, saveSettings } from './settings.ts'
import { sentryActive } from './sentry.ts'
import { checkForUpdates, getUpdateStatus, restartAndInstallUpdate } from './update.ts'
import { watchDocs } from './watcher.ts'

const CHECK_BATCH = 24
const PUSH_PREVIEW_TTL_MS = 5 * 60 * 1000

interface PendingPush {
  path: string
  force: boolean
  contentHash: string
}

const pushTickets = new OperationTickets<PendingPush>(PUSH_PREVIEW_TTL_MS, 20)
const pendingFileWrites = new Map<string, Promise<void>>()

let checkCancelled = false

type IpcHandler<Args extends unknown[], Result> = (event: IpcMainInvokeEvent, ...args: Args) => Result

function rendererUrl(): string {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) return process.env.ELECTRON_RENDERER_URL
  return PACKAGED_RENDERER_URL
}

function assertTrustedSender(event: IpcMainInvokeEvent, window: BrowserWindow | null): void {
  if (!window || event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('Refusing IPC from an untrusted renderer')
  }

  if (!isTrustedRendererLocation(rendererUrl(), event.senderFrame.url, app.isPackaged)) {
    throw new Error('Refusing IPC from an untrusted renderer URL')
  }
}

function stringValue(value: unknown, label: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > maxLength || (!allowEmpty && value.trim() === '')) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${label}`)
  return value
}

function docsPath(value: unknown, label = 'path'): string {
  const path = relativeAppPath(value, label)
  resolveExistingPathInsideRoot(docsRoot(), path, label)
  return path
}

function docsPaths(value: unknown, label = 'paths'): string[] {
  if (!Array.isArray(value) || value.length > 5000) throw new Error(`Invalid ${label}`)
  return value.map((path, index) => docsPath(path, `${label}[${index}]`))
}

function contentHash(path: string): string {
  const content = readFileSync(resolveExistingPathInsideRoot(docsRoot(), path))
  return createHash('sha256').update(content).digest('hex')
}

function fileWriteRequest(value: unknown): FileWriteRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid file write')
  const request = value as Record<string, unknown>
  const allowed = new Set(['path', 'expected', 'next', 'revision'])
  if (Object.keys(request).some(key => !allowed.has(key))) throw new Error('Invalid file write')
  const revision = request.revision
  if (!Number.isSafeInteger(revision) || (revision as number) < 0) throw new Error('Invalid file revision')
  return {
    path: docsPath(request.path),
    expected: stringValue(request.expected, 'expected file content', 32 * 1024 * 1024, true),
    next: stringValue(request.next, 'file content', 32 * 1024 * 1024, true),
    revision: revision as number,
  }
}

function serializeFileWrite<T>(path: string, write: () => T): Promise<T> {
  const previous = pendingFileWrites.get(path) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(write)
  const settled = current.then(() => undefined, () => undefined)
  pendingFileWrites.set(path, settled)
  return current.finally(() => {
    if (pendingFileWrites.get(path) === settled) pendingFileWrites.delete(path)
  })
}

function settingsPatch(value: unknown): Partial<Settings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid settings patch')
  const patch = value as Record<string, unknown>
  const allowed = new Set(['theme', 'vdocBin', 'contentDirs', 'pinnedDirs', 'crashReports'])
  if (Object.keys(patch).some(key => !allowed.has(key))) throw new Error('Invalid settings patch')

  const result: Partial<Settings> = {}
  if ('theme' in patch) {
    if (patch.theme !== 'dark' && patch.theme !== 'light' && patch.theme !== 'system') throw new Error('Invalid theme')
    result.theme = patch.theme
  }
  if ('vdocBin' in patch) {
    if (patch.vdocBin !== null && (typeof patch.vdocBin !== 'string' || patch.vdocBin.length > 4096 || patch.vdocBin.includes('\0'))) {
      throw new Error('Invalid vdoc binary')
    }
    result.vdocBin = patch.vdocBin as string | null
  }
  if ('contentDirs' in patch) result.contentDirs = settingPaths(patch.contentDirs, 'content directories')
  if ('pinnedDirs' in patch) result.pinnedDirs = settingPaths(patch.pinnedDirs, 'pinned directories')
  if ('crashReports' in patch) result.crashReports = booleanValue(patch.crashReports, 'crash reports setting')
  return result
}

function settingPaths(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error(`Invalid ${label}`)
  return value.map((path, index) => {
    const validated = docsPath(path, `${label}[${index}]`)
    if (!statSync(resolveExistingPathInsideRoot(docsRoot(), validated)).isDirectory()) throw new Error(`Invalid ${label}`)
    return validated
  })
}

export function registerIpc(
  getMainWindow: () => BrowserWindow | null,
  finishClose: (saved: boolean) => Promise<void>,
): void {
  const handle = <Args extends unknown[], Result>(channel: string, handler: IpcHandler<Args, Result>): void => {
    ipcMain.handle(channel, (event, ...args) => {
      assertTrustedSender(event, getMainWindow())
      return handler(event, ...args as Args)
    })
  }

  const confirmForce = async (title: string, message: string, detail: string, confirmLabel: string): Promise<boolean> => {
    const window = getMainWindow()
    if (!window) return false
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      title,
      message,
      detail,
      buttons: ['Cancel', confirmLabel],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    return response === 1
  }

  handle('scan', () => {
    const dirty = gitDirtyFiles()
    const files = scanMarkdownFiles().map(file => ({ ...file, gitDirty: dirty.has(file.path) }))
    return { root: docsRoot(), files }
  })

  handle('check-all', async event => {
    checkCancelled = false
    const tracked = scanMarkdownFiles().filter(file => file.tracked && !file.ignored).map(file => file.path)
    const results: CheckFile[] = []
    for (let i = 0; i < tracked.length; i += CHECK_BATCH) {
      // ponytail: cancel lands between batches - a running batch of 24 finishes first.
      if (checkCancelled) break
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

  handle('check-cancel', () => {
    checkCancelled = true
  })

  handle('check-files', async (_event, input: unknown) => {
    const paths = docsPaths(input)
    if (paths.length === 0) return []
    const { files } = await runVdocJson<{ files: CheckFile[] }>(['cf', 'check', ...paths])
    return files
  })

  handle('read-file', (_event, input: unknown) => readFileSync(resolveExistingPathInsideRoot(docsRoot(), input), 'utf8'))

  handle('backlinks', (_event, input: unknown) => backlinksTo(docsPath(input)))

  handle('search-content', (_event, input: unknown) => searchContent(stringValue(input, 'search query', 500, true)))

  handle('open-external', (_event, input: unknown) => {
    const url = new URL(stringValue(input, 'external URL', 2048))
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
      throw new Error('Refusing to open an invalid external URL')
    }
    return shell.openExternal(url.href)
  })

  handle('write-file', async (_event, input: unknown): Promise<FileWriteResult> => {
    const request = fileWriteRequest(input)
    const path = resolveExistingPathInsideRoot(docsRoot(), request.path)
    return serializeFileWrite(path, () => {
      const current = readFileSync(path, 'utf8')
      atomicWriteFile(path, contentForGuardedWrite(current, request.expected, request.next))
      return { revision: request.revision }
    })
  })

  handle('diff', (_event, input: unknown) => runVdocJson<DiffResult>(['cf', 'diff', docsPath(input)]))

  handle('record-baseline', (_event, input: unknown) =>
    runVdocJson<DiffResult>(['cf', 'diff', docsPath(input), '--record']))

  handle('last-version', async (_event, input: unknown) => {
    const path = docsPath(input)
    const { versions } = await runVdocJson<{ versions: VersionEntry[] }>(['cf', 'versions', path, '--limit', '1'])
    return versions[0] ?? null
  })

  handle('comments', async (_event, input: unknown) => {
    const path = docsPath(input)
    const { comments } = await runVdocJson<{ comments: CommentEntry[] }>(['cf', 'comments', path])
    return comments
  })

  handle('post-comment', async (_event, pathInput: unknown, textInput: unknown) => {
    const path = docsPath(pathInput)
    const text = stringValue(textInput, 'comment', 32_000)
    await runVdocJson(['cf', 'comment', path, text])
  })

  handle('labels', async (_event, input: unknown) => {
    const path = docsPath(input)
    const { labels } = await runVdocJson<{ labels: string[] }>(['cf', 'labels', path])
    return labels
  })

  handle('pull', async (_event, pathsInput: unknown, forceInput?: unknown) => {
    const paths = docsPaths(pathsInput)
    const force = forceInput === undefined ? false : booleanValue(forceInput, 'force flag')
    if (force && !await confirmForce(
      'Overwrite local content?',
      `Force pull ${paths.length} file(s) from Confluence?`,
      'Local body changes will be replaced by the remote version. This cannot be undone by V-DOC.',
      'Force pull',
    )) return null
    const args = ['cf', 'pull', ...paths]
    if (force) args.push('--force')
    const { files } = await runVdocJson<{ files: PullFile[] }>(args)
    return files
  })

  handle('push-preview', async (_event, pathInput: unknown, forceInput?: unknown) => {
    const path = docsPath(pathInput)
    const force = forceInput === undefined ? false : booleanValue(forceInput, 'force flag')
    const args = ['cf', 'push', path, '--dry-run']
    if (force) args.push('--force')
    const { files } = await runVdocJson<{ files: PushFile[] }>(args)
    const result = files[0]
    if (!result) throw new Error('Push preview returned no file')
    const token = randomUUID()
    pushTickets.issue(token, { path, force, contentHash: contentHash(path) })
    return { token, result }
  })

  handle('push-commit', async (_event, tokenInput: unknown) => {
    const token = stringValue(tokenInput, 'push preview token', 100)
    const pending = pushTickets.take(token)
    if (contentHash(pending.path) !== pending.contentHash) throw new Error('File changed after the push preview; preview it again')
    if (pending.force && !await confirmForce(
      'Overwrite Confluence content?',
      `Force push ${pending.path.split('/').at(-1)}?`,
      'Remote edits will be replaced by the local document. This cannot be undone by V-DOC.',
      'Force push',
    )) return null
    const args = ['cf', 'push', pending.path]
    if (pending.force) args.push('--force')
    const { files } = await runVdocJson<{ files: PushFile[] }>(args)
    const result = files[0]
    if (!result) throw new Error('Push returned no file')
    return result
  })

  handle('create', (_event, pathInput: unknown, spaceInput: unknown, parentInput?: unknown) => {
    const path = docsPath(pathInput)
    const space = stringValue(spaceInput, 'space key', 255)
    if (!/^[A-Za-z0-9_-]+$/.test(space)) throw new Error('Invalid space key')
    const parent = parentInput === undefined ? undefined : stringValue(parentInput, 'parent page', 2048)
    const args = ['cf', 'push', path, '--create', '--space', space]
    if (parent) args.push('--parent', parent)
    return runVdocJson<CreateResult>(args)
  })

  handle('md-init', (_event, input: unknown) =>
    runVdocJson<InitResult>(['md', 'init', docsPath(input)]))

  handle('get-page', (_event, pageInput: unknown, dirInput: unknown) => {
    const input = stringValue(pageInput, 'page URL or id', 2048)
    const dir = docsPath(dirInput, 'output directory')
    if (!statSync(resolveExistingPathInsideRoot(docsRoot(), dir)).isDirectory()) throw new Error('Invalid output directory')
    return runVdocJson<GetPageResult>(['cf', 'get', input, '--out', dir])
  })

  handle('file-for-page-id', (_event, input: unknown) => fileForPageId(stringValue(input, 'page id', 32)))

  handle('sync', async (_event, pathInput: unknown, spaceInput?: unknown) => {
    const path = docsPath(pathInput)
    const space = spaceInput === undefined ? undefined : stringValue(spaceInput, 'space key', 255)
    if (space && !/^[A-Za-z0-9_-]+$/.test(space)) throw new Error('Invalid space key')
    const args = ['cf', 'sync', path]
    if (space) args.push('--space', space)
    const { files } = await runVdocJson<{ files: SyncFile[] }>(args)
    return files
  })

  handle('lint', async (_event, input: unknown) => {
    const path = docsPath(input)
    const { files } = await runVdocJson<{ files: LintFile[] }>(['cf', 'lint', path])
    return files
  })

  handle('auth-status', () => authStatus())

  handle('set-token', async (_event, input: unknown) => {
    const token = stringValue(input, 'session token', 64 * 1024)
    await runVdocJson(['config', 'set', 'confluence.sessionToken', '--encrypt', token.trim()])
    return authStatus()
  })

  handle('save-api-key', async (_event, input: unknown) => {
    const apiToken = stringValue(input, 'API token', 64 * 1024)
    await runVdocJson(['config', 'set', 'confluence.apiToken', '--encrypt', apiToken.trim()])
    await runVdocJson(['config', 'set', 'confluence.authMethod', 'api-token'])
    return authStatus()
  })

  handle('credential-preview', async (_event, input: unknown) => {
    const key = stringValue(input, 'credential key', 32) as CredentialKey
    assertCredentialKey(key)
    const value = (await confluenceConfig())[key]
    return value ? maskSecret(value) : null
  })

  handle('credential-clear', async (_event, input: unknown) => {
    const key = stringValue(input, 'credential key', 32) as CredentialKey
    assertCredentialKey(key)
    await runVdocJson(['config', 'set', `confluence.${key}`, ''])
    return authStatus()
  })

  handle('set-auth-method', async (_event, input: unknown) => {
    if (input !== 'api-token' && input !== 'session-token') throw new Error('Invalid authentication method')
    const method = input
    await runVdocJson(['config', 'set', 'confluence.authMethod', method])
    return authStatus()
  })

  handle('confluence-url', async (_event, input: unknown) => {
    const path = docsPath(input)
    const { url } = await runVdocJson<{ url: string }>(['cf', 'open', path, '--print'])
    return url
  })

  handle('open-editor', async (_event, input: unknown) => {
    const error = await shell.openPath(resolveExistingPathInsideRoot(docsRoot(), input))
    if (error) throw new Error(error)
  })

  handle('reveal-finder', (_event, input: unknown) => {
    shell.showItemInFolder(resolveExistingPathInsideRoot(docsRoot(), input))
  })

  handle('settings-get', () => settingsInfo())

  handle('settings-set', (event, input: unknown) => {
    const patch = settingsPatch(input)
    const settings = { ...loadSettings(), ...patch }
    saveSettings(settings)
    setVdocBin(settings.vdocBin)
    if (patch.contentDirs || 'docsRoot' in patch) {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (window) watchDocs(window)
    }
    return settingsInfo()
  })

  handle('pick-folder', async event => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      defaultPath: docsRoot(),
      properties: ['openDirectory'],
      message: 'Pick a folder inside the docs repository',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const root = realpathSync(docsRoot())
    const selected = realpathSync(result.filePaths[0])
    const rel = relative(root, selected)
    if (rel === '' || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
      throw new Error('The folder must be inside the docs repository')
    }
    // App-internal paths always use forward slashes, whatever the OS.
    return relativeAppPath(rel.replaceAll('\\', '/'), 'content directory')
  })

  handle('pick-docs-root', async event => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      defaultPath: docsRoot(),
      properties: ['openDirectory'],
      message: 'Pick the docs repository root',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const root = realpathSync(result.filePaths[0])
    if (!statSync(root).isDirectory() || !isAbsolute(root)) throw new Error('Invalid docs repository root')
    saveSettings({ ...loadSettings(), docsRoot: root })
    watchDocs(window)
    return settingsInfo()
  })

  handle('open-folder', async (_event, input: unknown) => {
    const error = await shell.openPath(resolveExistingPathInsideRoot(docsRoot(), input))
    if (error) throw new Error(error)
  })

  handle('set-assets-dir', async (_event, input: unknown) => {
    const dir = input === null ? null : relativeAppPath(input, 'assets directory')
    if (dir === null) await runVdocJson(['config', 'set', 'confluence.assetsDir', '--delete'])
    else await runVdocJson(['config', 'set', 'confluence.assetsDir', dir])
    return settingsInfo()
  })

  handle('set-site', async (_event, input: unknown) => {
    const site = input === null ? null : stringValue(input, 'Confluence site', 253)
    if (site && !/^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(site)) {
      throw new Error('Invalid Confluence site')
    }
    if (site === null) await runVdocJson(['config', 'set', 'confluence.site', '--delete'])
    else await runVdocJson(['config', 'set', 'confluence.site', site])
    return settingsInfo()
  })

  handle('space-mapping-get', () => spaceMapping())

  handle('space-mapping-set', async (_event, dirInput: unknown, spaceInput: unknown) => {
    const dir = docsPath(dirInput, 'mapping directory')
    if (!statSync(resolveExistingPathInsideRoot(docsRoot(), dir)).isDirectory()) throw new Error('Invalid mapping directory')
    const space = spaceInput === null ? null : stringValue(spaceInput, 'space key', 255)
    if (space && !/^[A-Za-z0-9_-]+$/.test(space)) throw new Error('Invalid space key')
    const key = `confluence.spaceMapping.${dir}`
    if (space === null) await runVdocJson(['config', 'set', key, '--delete'])
    else await runVdocJson(['config', 'set', key, space])
    return spaceMapping()
  })

  handle('reveal-config', async () => {
    const { path } = await runVdocJson<{ path: string }>(['config', 'path'])
    shell.showItemInFolder(path)
  })

  handle('edit-config', async () => {
    const { path } = await runVdocJson<{ path: string }>(['config', 'path'])
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })

  handle('vdoc-logs', () => vdocLogs())

  handle('vdoc-version', () => probeVersion())

  handle('update-status', () => getUpdateStatus())

  handle('check-update', () => checkForUpdates())

  handle('install-update', () => restartAndInstallUpdate())

  handle('sentry-active', () => sentryActive)

  handle('close-ready', (_event, input: unknown) => finishClose(booleanValue(input, 'save result')))

  handle('quit', () => app.quit())
}

async function settingsInfo(): Promise<SettingsInfo> {
  const configPath = await runVdocJson<{ path: string }>(['config', 'path']).then(r => r.path).catch(() => null)
  const [assetsDir, site] = await Promise.all([configScalar('confluence.assetsDir'), configScalar('confluence.site')])
  return {
    ...loadSettings(),
    resolvedBin: resolvedVdocBin(),
    resolvedRoot: docsRoot(),
    version: await probeVersion(),
    cliRequirement: loadCliRequirement(),
    appVersion: app.getVersion(),
    configPath,
    assetsDir,
    site,
  }
}

/** Compatibility metadata is app release config, deliberately separate from user settings. */
function loadCliRequirement(): VdocCliRequirement | null {
  try {
    const packageJson = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as unknown
    return parseVdocCliRequirement(packageJson)
  } catch {
    return null
  }
}

/** One string value from the config file - `config get <key> --json` wraps scalars as { "<key>": value }. */
function configScalar(key: string): Promise<string | null> {
  return runVdocJson<Record<string, unknown>>(['config', 'get', key])
    .then(result => {
      const value = result?.[key]
      return typeof value === 'string' && value !== '' ? value : null
    })
    .catch(() => null)
}

/** The shared config file's folder → space mapping ({} when absent). */
function spaceMapping(): Promise<Record<string, string>> {
  return runVdocJson<Record<string, string>>(['config', 'get', 'confluence.spaceMapping'])
    .then(mapping => mapping ?? {})
    .catch(() => ({}))
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
}

function assertCredentialKey(key: string): void {
  if (key !== 'apiToken' && key !== 'sessionToken') throw new Error(`Not a credential key: ${key}`)
}

/** The decrypted confluence section of the config file ({} when unreadable). */
function confluenceConfig(): Promise<ConfluenceConfig> {
  return runVdocJson<ConfluenceConfig>(['config', 'get', 'confluence', '--decrypt'])
    .catch(() => ({}) as ConfluenceConfig)
}

/** Probe credentials via whoami; tokens themselves never leave the main process. */
async function authStatus(): Promise<AuthStatus> {
  const config = await confluenceConfig()

  // Mirror the CLI's resolution: an explicit session-token preference skips the stored API key.
  const method: AuthStatus['method'] = config.authMethod === 'session-token'
    ? (config.sessionToken ? 'session-token' : 'none')
    : config.apiToken
      ? 'api-token'
      : config.sessionToken ? 'session-token' : 'none'
  const tokenExp = method === 'session-token' && config.sessionToken ? decodeJwtExp(config.sessionToken) : undefined
  const base = { method, tokenExp, hasApiKey: Boolean(config.apiToken), hasSessionToken: Boolean(config.sessionToken), spaces: [] }

  if (method === 'none') return { ok: false, ...base, error: 'No Confluence credentials configured' }

  try {
    const whoami = await runVdocJson<{ displayName: string, spaces?: unknown }>(['cf', 'whoami'])
    return { ok: true, ...base, displayName: whoami.displayName, spaces: parseConfluenceSpaces(whoami.spaces) }
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
