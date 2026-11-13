import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, relative, sep } from 'node:path'
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'

import type { AuthStatus, CheckFile, CommentEntry, CreateResult, CredentialKey, DiffResult, FileWriteResult, GetPageRecursiveResult, GetPageResult, InitResult, LintFile, PullFile, PushFile, RepoSettings, Settings, SettingsInfo, SyncFile, VersionEntry } from '../shared/types.ts'
import { parseVdocCliRequirement, type VdocCliRequirement } from '../shared/app-config.ts'
import { clipboardText } from '../shared/clipboard.ts'
import { parseConfluenceSpaces } from '../shared/confluence.ts'
import { isTrustedRendererLocation, PACKAGED_RENDERER_URL } from '../shared/electron-policy.ts'
import { contentForGuardedWrite } from '../shared/file-write.ts'
import { CancellableOperation } from '../shared/cancellable-operation.ts'
import { relativeAppPath, resolvePathInsideRoot } from '../shared/path-policy.ts'
import { fromCliPath, joinRepoPath, splitRepoPath, uniqueAlias } from '../shared/repo-path.ts'
import { LossyPushAccess } from '../shared/lossy-push.ts'
import { maskSecret } from '../shared/secret.ts'
import { OperationTickets } from '../shared/operation-tickets.ts'
import { atomicWriteFile } from './atomic-write.ts'
import { availableRepos, backlinksTo, fileForPageId, gitDirtyFiles, resolveAppPath, resolvedVdocBin, runVdoc, runVdocJson, scanFiles, scanMarkdownFiles, searchContent, setVdocBin, VdocCancelledError, vdocLogs, type RepoPath } from './vdoc.ts'
import { loadSettings, repoByAlias, saveSettings } from './settings.ts'
import { sentryActive, traceAppAction } from './sentry.ts'
import { checkForUpdates, getUpdateStatus, restartAndInstallUpdate } from './update.ts'
import { watchDocs } from './watcher.ts'

const CHECK_BATCH = 24

interface RepoBatch {
  repo: RepoSettings
  rels: string[]
}

/** A scanned app path back to its repository - the alias is known, the scan just produced it. */
const scannedPath = (path: string): Pick<RepoPath, 'repo' | 'rel'> => {
  const { alias, rel } = splitRepoPath(path)
  return { repo: repoByAlias(alias)!, rel }
}

/** Batches of 24 per repository, in order - keeps argv far below Windows' 32,767-character command line. */
function repoBatches(paths: Array<Pick<RepoPath, 'repo' | 'rel'>>): RepoBatch[] {
  const groups = new Map<string, RepoBatch>()
  for (const { repo, rel } of paths) {
    const group = groups.get(repo.alias) ?? { repo, rels: [] }
    group.rels.push(rel)
    groups.set(repo.alias, group)
  }
  return [...groups.values()].flatMap(({ repo, rels }) => {
    const batches: RepoBatch[] = []
    for (let i = 0; i < rels.length; i += CHECK_BATCH) batches.push({ repo, rels: rels.slice(i, i + CHECK_BATCH) })
    return batches
  })
}

/** One CLI run per repository batch, every result's `file` turned back into an app path. */
async function inBatches<T extends { file: string }>(paths: RepoPath[], run: (batch: RepoBatch) => Promise<T[]>): Promise<T[]> {
  const results: T[] = []
  for (const batch of repoBatches(paths)) results.push(...(await run(batch)).map(item => appFile(batch.repo, item)))
  return results
}

/** The CLI echoes paths relative to the repository it ran in; the renderer only knows app paths. */
const appFile = <T extends { file: string }>(repo: RepoSettings, item: T): T => ({ ...item, file: fromCliPath(repo.alias, item.file) })

/** What a repo list change means for the running check and the watchers - pins do not count. */
const repoLayout = (repos: RepoSettings[]): string => JSON.stringify(repos.map(repo => [repo.alias, repo.root, repo.contentDirs]))

const PUSH_PREVIEW_TTL_MS = 5 * 60 * 1000

interface PendingPush {
  path: string
  force: boolean
  allowLossy: boolean
  contentHash: string
}

const pushTickets = new OperationTickets<PendingPush>(PUSH_PREVIEW_TTL_MS, 20)
const lossyPushAccess = new LossyPushAccess()
const pendingFileWrites = new Map<string, Promise<void>>()

const checkOperation = new CancellableOperation()

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

/** An existing document: `<alias>/<path inside the repository>`. */
const docsPath = (value: unknown, label = 'path'): RepoPath => resolveAppPath(value, label)

/** An existing folder - the bare alias is the repository root. */
function docsDir(value: unknown, label = 'directory'): RepoPath {
  const target = resolveAppPath(value, label, true)
  if (!statSync(target.abs).isDirectory()) throw new Error(`Invalid ${label}`)
  return target
}

function docsPaths(value: unknown, label = 'paths'): RepoPath[] {
  if (!Array.isArray(value) || value.length > 5000) throw new Error(`Invalid ${label}`)
  return value.map((path, index) => docsPath(path, `${label}[${index}]`))
}

function contentHash(abs: string): string {
  return createHash('sha256').update(readFileSync(abs)).digest('hex')
}

interface FileWrite {
  target: RepoPath
  expected: string
  next: string
  revision: number
}

function fileWriteRequest(value: unknown): FileWrite {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid file write')
  const request = value as Record<string, unknown>
  const allowed = new Set(['path', 'expected', 'next', 'revision'])
  if (Object.keys(request).some(key => !allowed.has(key))) throw new Error('Invalid file write')
  const revision = request.revision
  if (!Number.isSafeInteger(revision) || (revision as number) < 0) throw new Error('Invalid file revision')
  return {
    target: docsPath(request.path),
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
  const allowed = new Set(['theme', 'vdocBin', 'repos', 'crashReports'])
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
  if ('repos' in patch) result.repos = repoListPatch(patch.repos)
  if ('crashReports' in patch) result.crashReports = booleanValue(patch.crashReports, 'diagnostics setting')
  return result
}

/**
 * The whole list is replaced, but a root only ever enters through the native add-repo dialog: the renderer
 * may reorder, drop and edit the lists of known repositories. Paths are checked lexically only (an unplugged
 * drive keeps its entry).
 */
function repoListPatch(value: unknown): RepoSettings[] {
  if (!Array.isArray(value) || value.length > 50) throw new Error('Invalid repositories')
  const known = new Map(loadSettings().repos.map(repo => [repo.alias, repo.root]))
  const aliases = new Set<string>()
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid repository')
    const { alias, root, contentDirs, pinnedDirs, pinnedFiles } = entry as Record<string, unknown>
    if (typeof alias !== 'string' || !known.has(alias) || aliases.has(alias)) throw new Error('Invalid repository alias')
    aliases.add(alias)
    if (typeof root !== 'string' || root !== known.get(alias)) throw new Error('Invalid repository root')
    return {
      alias,
      root,
      contentDirs: settingPaths(contentDirs, 'content directories', true),
      pinnedDirs: settingPaths(pinnedDirs, 'pinned directories'),
      pinnedFiles: settingPaths(pinnedFiles, 'pinned files', false, 5000),
    }
  })
}

function settingPaths(value: unknown, label: string, allowRoot = false, max = 100): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`Invalid ${label}`)
  return [...new Set(value.map((path, index) => (allowRoot && path === '' ? '' : relativeAppPath(path, `${label}[${index}]`))))]
}

export function registerIpc(
  getMainWindow: () => BrowserWindow | null,
  finishClose: (saved: boolean) => Promise<void>,
): void {
  const handle = <Args extends unknown[], Result>(channel: string, handler: IpcHandler<Args, Result>): void => {
    ipcMain.handle(channel, (event, ...args) => {
      assertTrustedSender(event, getMainWindow())
      return traceAppAction(channel, () => handler(event, ...args as Args))
    })
  }

  handle('scan', () => {
    const repos = loadSettings().repos.map(repo => ({ alias: repo.alias, root: repo.root, available: existsSync(repo.root) }))
    const dirty = new Set(availableRepos().flatMap(repo => [...gitDirtyFiles(repo)].map(rel => joinRepoPath(repo.alias, rel))))
    const files = scanMarkdownFiles().map(file => ({ ...file, gitDirty: dirty.has(file.path) }))
    return { repos, files }
  })

  handle('scan-files', (_event, input: unknown) => {
    if (!Array.isArray(input) || input.length > 5000) throw new Error('Invalid paths')
    const paths = input.map((path, index) => relativeAppPath(path, `paths[${index}]`))
    const scanned = scanFiles(paths)
    if (!scanned) return null
    const dirty = new Set(repoBatches(paths.map(scannedPath)).flatMap(({ repo, rels }) => [...gitDirtyFiles(repo, rels)].map(rel => joinRepoPath(repo.alias, rel))))
    return scanned.map(file => ({ ...file, gitDirty: dirty.has(file.path) }))
  })

  handle('check-all', async event => {
    const signal = checkOperation.start()
    try {
      const tracked = scanMarkdownFiles().filter(file => file.tracked && !file.ignored).map(file => file.path)
      let done = 0
      for (const { repo, rels } of repoBatches(tracked.map(scannedPath))) {
        if (signal.aborted) break
        try {
          const { files } = await runVdocJson<{ files: CheckFile[] }>(['cf', 'check', ...rels], { signal, repo })
          done += rels.length
          if (!event.sender.isDestroyed()) {
            event.sender.send('check-progress', { done, total: tracked.length, results: files.map(file => appFile(repo, file)) })
          }
        } catch (error) {
          if (error instanceof VdocCancelledError) break
          throw error
        }
      }
      return { cancelled: signal.aborted }
    } finally {
      checkOperation.finish(signal)
    }
  })

  handle('check-cancel', () => {
    checkOperation.cancel()
  })

  handle('check-files', (_event, input: unknown) =>
    inBatches(docsPaths(input), async ({ repo, rels }) => (await runVdocJson<{ files: CheckFile[] }>(['cf', 'check', ...rels], { repo })).files))

  handle('read-file', (_event, input: unknown) => readFileSync(docsPath(input).abs, 'utf8'))

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
    const path = request.target.abs
    return serializeFileWrite(path, () => {
      const current = readFileSync(path, 'utf8')
      atomicWriteFile(path, contentForGuardedWrite(current, request.expected, request.next))
      return { revision: request.revision }
    })
  })

  handle('diff', async (_event, input: unknown) => {
    const { repo, rel } = docsPath(input)
    return appFile(repo, await runVdocJson<DiffResult>(['cf', 'diff', rel], { repo }))
  })

  handle('record-baseline', async (_event, input: unknown) => {
    const { repo, rel } = docsPath(input)
    return appFile(repo, await runVdocJson<DiffResult>(['cf', 'diff', rel, '--record'], { repo }))
  })

  handle('last-version', async (_event, input: unknown) => {
    const { repo, rel } = docsPath(input)
    const { versions } = await runVdocJson<{ versions: VersionEntry[] }>(['cf', 'versions', rel, '--limit', '1'], { repo })
    return versions[0] ?? null
  })

  handle('comments', async (_event, input: unknown) => {
    const { repo, rel } = docsPath(input)
    const { comments } = await runVdocJson<{ comments: CommentEntry[] }>(['cf', 'comments', rel], { repo })
    return comments
  })

  handle('post-comment', async (_event, pathInput: unknown, textInput: unknown, replyToInput?: unknown) => {
    const { repo, rel } = docsPath(pathInput)
    const text = stringValue(textInput, 'comment', 32_000)
    // shortcut: oclif reads a leading "-" as a flag, drop once the CLI accepts the body another way
    if (text.startsWith('-')) throw new Error('A comment cannot start with "-": the vdoc CLI reads it as a flag')
    if (replyToInput !== undefined && (typeof replyToInput !== 'string' || !/^\d{1,20}$/.test(replyToInput))) {
      throw new Error('Invalid comment id')
    }
    await runVdocJson(['cf', 'comment', rel, text, ...(replyToInput === undefined ? [] : ['--reply-to', replyToInput])], { repo })
  })

  handle('labels', async (_event, input: unknown) => {
    const { repo, rel } = docsPath(input)
    const { labels } = await runVdocJson<{ labels: string[] }>(['cf', 'labels', rel], { repo })
    return labels
  })

  handle('pull', (_event, pathsInput: unknown, forceInput?: unknown) => {
    const paths = docsPaths(pathsInput)
    const force = forceInput === undefined ? false : booleanValue(forceInput, 'force flag')
    return inBatches(paths, async ({ repo, rels }) => (await runVdocJson<{ files: PullFile[] }>(['cf', 'pull', ...rels, ...(force ? ['--force'] : [])], { repo })).files)
  })

  handle('push-preview', async (_event, pathInput: unknown, forceInput?: unknown, allowLossyInput?: unknown) => {
    const target = docsPath(pathInput)
    const path = relativeAppPath(pathInput)
    const force = forceInput === undefined ? false : booleanValue(forceInput, 'force flag')
    const allowLossy = allowLossyInput === undefined ? false : booleanValue(allowLossyInput, 'allow lossy flag')
    if (allowLossy && !lossyPushAccess.allows(path)) throw new Error('Push force is not available for this file')
    const args = ['cf', 'push', target.rel, '--dry-run']
    if (force) args.push('--force')
    if (allowLossy) args.push('--allow-lossy')
    let files: PushFile[]
    try {
      ({ files } = await runVdocJson<{ files: PushFile[] }>(args, { repo: target.repo }))
    } catch (error) {
      if (!allowLossy) lossyPushAccess.grantAfterError(path, error)
      throw error
    }
    const result = files[0]
    if (!result) throw new Error('Push preview returned no file')
    const token = randomUUID()
    pushTickets.issue(token, { path, force, allowLossy, contentHash: contentHash(target.abs) })
    return { token, result: appFile(target.repo, result) }
  })

  handle('push-commit', async (_event, tokenInput: unknown) => {
    const token = stringValue(tokenInput, 'push preview token', 100)
    const pending = pushTickets.take(token)
    const target = docsPath(pending.path)
    if (contentHash(target.abs) !== pending.contentHash) throw new Error('File changed after the push preview; preview it again')
    if (pending.allowLossy && !lossyPushAccess.allows(pending.path)) throw new Error('Push force is no longer available for this file')
    const args = ['cf', 'push', target.rel]
    if (pending.force) args.push('--force')
    if (pending.allowLossy) args.push('--allow-lossy')
    let files: PushFile[]
    try {
      ({ files } = await runVdocJson<{ files: PushFile[] }>(args, { repo: target.repo }))
    } catch (error) {
      if (!pending.allowLossy) lossyPushAccess.grantAfterError(pending.path, error)
      throw error
    }
    const result = files[0]
    if (!result) throw new Error('Push returned no file')
    lossyPushAccess.revoke(pending.path)
    return appFile(target.repo, result)
  })

  handle('create', async (_event, pathInput: unknown, spaceInput: unknown, parentInput?: unknown) => {
    const { repo, rel } = docsPath(pathInput)
    const space = stringValue(spaceInput, 'space key', 255)
    if (!/^[A-Za-z0-9_-]+$/.test(space)) throw new Error('Invalid space key')
    const parent = parentInput === undefined ? undefined : stringValue(parentInput, 'parent page', 2048)
    const args = ['cf', 'push', rel, '--create', '--space', space]
    if (parent) args.push('--parent', parent)
    return appFile(repo, await runVdocJson<CreateResult>(args, { repo }))
  })

  handle('md-init', async (_event, input: unknown) => {
    const { repo, rel } = docsPath(input)
    const { files } = await runVdocJson<InitResult>(['md', 'init', rel], { repo })
    return { files: files.map(file => appFile(repo, file)) }
  })

  handle('get-page', async (_event, pageInput: unknown, dirInput: unknown, recursiveInput?: unknown) => {
    const input = stringValue(pageInput, 'page URL or id', 2048)
    const { repo, rel } = docsDir(dirInput, 'output directory')
    const args = ['cf', 'get', input, '--out', rel || '.']
    if (recursiveInput === true) args.push('--recursive')
    const result = await runVdocJson<GetPageResult | GetPageRecursiveResult>(args, { repo })
    if ('pages' in result) return { ...result, pages: result.pages.map(page => appFile(repo, page)) }
    return result.file ? appFile(repo, { ...result, file: result.file }) : result
  })

  handle('file-for-page-id', (_event, input: unknown) => fileForPageId(stringValue(input, 'page id', 32)))

  handle('sync', async (_event, pathInput: unknown, spaceInput?: unknown) => {
    const { repo, rel } = docsPath(pathInput)
    const space = spaceInput === undefined ? undefined : stringValue(spaceInput, 'space key', 255)
    if (space && !/^[A-Za-z0-9_-]+$/.test(space)) throw new Error('Invalid space key')
    const args = ['cf', 'sync', rel]
    if (space) args.push('--space', space)
    const { files } = await runVdocJson<{ files: SyncFile[] }>(args, { repo })
    return files.map(file => appFile(repo, file))
  })

  handle('lint', async (_event, input: unknown) => {
    const { repo, rel } = docsPath(input)
    const { files } = await runVdocJson<{ files: LintFile[] }>(['cf', 'lint', rel], { repo })
    return files.map(file => appFile(repo, file))
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
    const { repo, rel } = docsPath(input)
    const { url } = await runVdocJson<{ url: string }>(['cf', 'open', rel, '--print'], { repo })
    return url
  })

  handle('open-editor', async (_event, input: unknown) => {
    const error = await shell.openPath(docsPath(input).abs)
    if (error) throw new Error(error)
  })

  handle('reveal-finder', (_event, input: unknown) => {
    shell.showItemInFolder(docsPath(input).abs)
  })

  handle('settings-get', () => settingsInfo())

  handle('settings-set', (event, input: unknown) => {
    const patch = settingsPatch(input)
    const previous = loadSettings()
    const settings = { ...previous, ...patch }
    saveSettings(settings)
    setVdocBin(settings.vdocBin)
    if (patch.repos && repoLayout(patch.repos) !== repoLayout(previous.repos)) {
      // A running check would send results for files that just left the tree.
      checkOperation.cancel()
      const window = BrowserWindow.fromWebContents(event.sender)
      if (window) watchDocs(window)
    }
    return settingsInfo('vdocBin' in patch)
  })

  handle('pick-folder', async (event, aliasInput: unknown) => {
    const repo = repoByAlias(stringValue(aliasInput, 'repository alias', 100))
    if (!repo) throw new Error('Unknown repository')
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      defaultPath: repo.root,
      properties: ['openDirectory'],
      message: `Pick a folder inside ${repo.alias}`,
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const rel = relative(realpathSync(repo.root), realpathSync(result.filePaths[0]))
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`The folder must be inside ${repo.alias} (${repo.root})`)
    // App-internal paths always use forward slashes, whatever the OS; '' is the repository root.
    return rel === '' ? '' : relativeAppPath(rel.replaceAll('\\', '/'), 'content directory')
  })

  handle('add-repo', async event => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      defaultPath: homedir(),
      properties: ['openDirectory'],
      message: 'Pick the root folder of a docs repository',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const root = realpathSync(result.filePaths[0])
    if (!statSync(root).isDirectory() || !isAbsolute(root)) throw new Error('Invalid repository root')
    // The CLI keeps its state next to .git (or .vdoc): anything else would share state with a parent folder.
    if (!existsSync(join(root, '.git')) && !existsSync(join(root, '.vdoc'))) throw new Error('Pick the root of a git repository - the folder holding .git (or .vdoc)')
    const settings = loadSettings()
    if (settings.repos.some(repo => repo.root === root)) throw new Error(`${root} is already in the workspace`)
    // The alias is a path segment: no separators, drive-letter look-alikes or dot names.
    const base = basename(root).replace(/[^\w.-]+/g, '-')
    const alias = uniqueAlias(/^\.{0,2}$/.test(base) ? 'repo' : base, settings.repos.map(repo => repo.alias))
    saveSettings({ ...settings, repos: [...settings.repos, { alias, root, contentDirs: [''], pinnedDirs: [], pinnedFiles: [] }] })
    watchDocs(window)
    return settingsInfo(false)
  })

  handle('open-folder', async (_event, input: unknown) => {
    const error = await shell.openPath(docsDir(input).abs)
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
    const dir = relativeAppPath(dirInput, 'mapping directory')
    const isFolder = (repo: RepoSettings): boolean => {
      try {
        return statSync(resolvePathInsideRoot(repo.root, dir)).isDirectory()
      } catch {
        return false
      }
    }
    if (!availableRepos().some(isFolder)) throw new Error('Invalid mapping directory')
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

  handle('clipboard-write', (_event, input: unknown) => clipboard.writeText(clipboardText(input)))

  handle('vdoc-version', () => probeVersion())

  handle('update-status', () => getUpdateStatus())

  handle('check-update', () => checkForUpdates())

  handle('install-update', () => restartAndInstallUpdate())

  handle('sentry-active', () => sentryActive)

  handle('close-ready', (_event, input: unknown) => finishClose(booleanValue(input, 'save result')))

  handle('quit', () => app.quit())
}

let cliInfo: Pick<SettingsInfo, 'version' | 'configPath' | 'assetsDir' | 'site'> | null = null

/** The CLI-derived fields cost four vdoc spawns - re-probed only when the binary, the repo or the config changed. */
async function settingsInfo(refreshCli = true): Promise<SettingsInfo> {
  if (refreshCli || !cliInfo) {
    const configPath = await runVdocJson<{ path: string }>(['config', 'path']).then(r => r.path).catch(() => null)
    const [assetsDir, site, version] = await Promise.all([configScalar('confluence.assetsDir'), configScalar('confluence.site'), probeVersion()])
    cliInfo = { configPath, assetsDir, site, version }
  }
  return {
    ...loadSettings(),
    resolvedBin: resolvedVdocBin(),
    cliRequirement: loadCliRequirement(),
    appVersion: app.getVersion(),
    ...cliInfo,
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

/** The shared config file's top-level folder name → space mapping ({} when absent). */
function spaceMapping(): Promise<Record<string, string>> {
  return runVdocJson<Record<string, string>>(['config', 'get', 'confluence.spaceMapping'])
    .then(mapping => mapping ?? {})
    .catch(() => ({}))
}

/** First stdout line of `vdoc --version`, or null when the binary is unusable. */
async function probeVersion(): Promise<string | null> {
  const { exitCode, stdout } = await runVdoc(['--version'], { timeoutMs: 15_000 })
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
