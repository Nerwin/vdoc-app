import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { AuthStatus, CheckFile, DiffResult, DisplayState, PushFile, ScanFile, Settings, SettingsInfo, VersionEntry } from '../../shared/types.ts'
import { displayState, needsAttention, type FileEntry } from '../../shared/status.ts'
import { STATE_META } from './state-meta.ts'

export interface Message {
  kind: 'info' | 'error'
  text: string
  detail?: string[]
}

export interface PushPreview {
  path: string
  result: PushFile
  force: boolean
}

export interface PullConfirm {
  paths: string[]
  force: boolean
}

const normalize = (path: string): string => path.replace(/^\.\//, '')

/** A full re-check runs at most once per hour on window focus. */
const FULL_CHECK_TTL_MS = 60 * 60 * 1000
/** Focus-triggered partial re-checks are throttled to once a minute. */
const FOCUS_THROTTLE_MS = 60 * 1000

export function useApp() {
  const api = window.vdoc

  const [root, setRoot] = useState('')
  const [entries, setEntries] = useState<Map<string, FileEntry>>(new Map())
  const [selection, setSelection] = useState<string | null>(null)
  const [filterText, setFilterText] = useState('')
  const [stateFilter, setStateFilter] = useState<DisplayState | 'attention' | null>(null)
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [checking, setChecking] = useState<{ done: number, total: number } | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [busyOp, setBusyOp] = useState<string | null>(null)
  const [diff, setDiff] = useState<{ path: string, result: DiffResult } | null>(null)
  const [diffLoading, setDiffLoading] = useState<string | null>(null)
  const [pushPreview, setPushPreview] = useState<PushPreview | null>(null)
  const [pullConfirm, setPullConfirm] = useState<PullConfirm | null>(null)
  const [createForm, setCreateForm] = useState<{ path: string } | null>(null)
  const [settings, setSettings] = useState<SettingsInfo | null>(null)
  const [spaceMapping, setSpaceMapping] = useState<Record<string, string>>({})
  /** Latest remote version info per file, keyed `path@vN` so a new version refetches. */
  const [authors, setAuthors] = useState<Map<string, VersionEntry | null>>(new Map())
  const [message, setMessage] = useState<Message | null>(null)

  const checkingRef = useRef(false)
  const lastFocusCheckRef = useRef(0)

  const fail = useCallback((error: unknown) => {
    setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) })
  }, [])

  const applyChecks = useCallback((results: CheckFile[]) => {
    setEntries(prev => {
      const next = new Map(prev)
      for (const result of results) {
        const path = normalize(result.file)
        const entry = next.get(path)
        next.set(path, { ...entry, path, tracked: entry?.tracked ?? true, check: result })
      }
      return next
    })
  }, [])

  const mergeScan = useCallback((files: ScanFile[]) => {
    setEntries(prev => {
      const next = new Map<string, FileEntry>()
      for (const file of files) {
        const previous = prev.get(file.path)
        next.set(file.path, {
          path: file.path,
          tracked: file.tracked,
          gitDirty: file.gitDirty,
          check: file.tracked ? previous?.check : undefined,
        })
      }
      return next
    })
  }, [])

  const checkAll = useCallback(async () => {
    if (checkingRef.current) return
    checkingRef.current = true
    setChecking({ done: 0, total: 0 })
    try {
      applyChecks(await api.checkAll())
      setLastChecked(new Date())
    } catch (error) {
      fail(error)
    } finally {
      checkingRef.current = false
      setChecking(null)
    }
  }, [api, applyChecks, fail])

  const recheck = useCallback(async (paths: string[]) => {
    try {
      applyChecks(await api.checkFiles(paths))
    } catch (error) {
      fail(error)
    }
  }, [api, applyChecks, fail])

  useEffect(() => {
    void api.settingsGet().then(setSettings).catch(fail)
    void api.spaceMappingGet().then(setSpaceMapping).catch(fail)
  }, [api, fail])

  // Initial load: tree first (fast, local), then auth probe, then the full check.
  useEffect(() => {
    void (async () => {
      try {
        const scan = await api.scan()
        setRoot(scan.root)
        mergeScan(scan.files)
      } catch (error) {
        fail(error)
        return
      }
      const status = await api.authStatus()
      setAuth(status)
      if (status.ok) void checkAll()
      else setMessage({ kind: 'error', text: status.error ?? 'Confluence authentication failed' })
    })()
  }, [api, checkAll, fail, mergeScan])

  useEffect(() => api.onCheckProgress(progress => {
    setChecking({ done: progress.done, total: progress.total })
    applyChecks(progress.results)
  }), [api, applyChecks])

  useEffect(() => api.onFilesChanged(changed => {
    void (async () => {
      try {
        const scan = await api.scan()
        setRoot(scan.root)
        mergeScan(scan.files)
        setDiff(current => (current && changed.includes(current.path) ? null : current))
        const tracked = new Set(scan.files.filter(file => file.tracked).map(file => file.path))
        const present = changed.filter(path => tracked.has(path))
        if (present.length > 0) applyChecks(await api.checkFiles(present))
      } catch (error) {
        fail(error)
      }
    })()
  }), [api, applyChecks, fail, mergeScan])

  // On window focus: full check when the last one is over an hour old, otherwise
  // just refresh the files already needing attention (cheap, one API call each).
  useEffect(() => {
    const onFocus = (): void => {
      if (checkingRef.current || busyOp) return
      const now = Date.now()
      if (now - lastFocusCheckRef.current < FOCUS_THROTTLE_MS) return
      lastFocusCheckRef.current = now

      if (!lastChecked || now - lastChecked.getTime() > FULL_CHECK_TTL_MS) {
        void checkAll()
        return
      }
      const attention = [...entries.values()]
        .filter(entry => needsAttention(displayState(entry)))
        .map(entry => entry.path)
      if (attention.length > 0) void recheck(attention)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [busyOp, checkAll, entries, lastChecked, recheck])

  const loadDiff = useCallback(async (path: string, force = false) => {
    if (!force && diff?.path === path) return
    setDiffLoading(path)
    try {
      const result = await api.diff(path)
      setDiff({ path, result })
    } catch (error) {
      fail(error)
    } finally {
      setDiffLoading(current => (current === path ? null : current))
    }
  }, [api, diff, fail])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), message.detail?.length ? 10_000 : 6000)
    return () => clearTimeout(timer)
  }, [message])

  const runOp = useCallback(async (label: string, op: () => Promise<void>) => {
    if (busyOp) return
    setBusyOp(label)
    try {
      await op()
    } catch (error) {
      fail(error)
    } finally {
      setBusyOp(null)
    }
  }, [busyOp, fail])

  const doPull = useCallback((paths: string[], force: boolean) => runOp('pull', async () => {
    const results = await api.pull(paths, force)
    setPullConfirm(null)
    const pulled = results.filter(result => result.status === 'pulled' || result.status === 'updated').length
    setMessage({ kind: 'info', text: `Pull: ${pulled}/${results.length} file(s) updated` })
    setDiff(current => (current && paths.includes(current.path) ? null : current))
    await recheck(paths)
  }), [api, recheck, runOp])

  const requestPull = useCallback((path: string) => {
    const entry = entries.get(path)
    const state = entry ? displayState(entry) : 'unchecked'
    if (state === 'local-edits' || state === 'conflict' || state === 'unverified') {
      setPullConfirm({ paths: [path], force: true })
    } else {
      void doPull([path], false)
    }
  }, [doPull, entries])

  const pullAllBehind = useCallback(() => {
    const behind = [...entries.values()].filter(entry => displayState(entry) === 'behind').map(entry => entry.path)
    if (behind.length > 0) setPullConfirm({ paths: behind, force: false })
  }, [entries])

  const requestPush = useCallback((path: string, force = false) => runOp('push preview', async () => {
    const [dry] = await api.push(path, true, force)
    setPushPreview({ path, result: dry, force })
  }), [api, runOp])

  const confirmPush = useCallback(() => {
    if (!pushPreview) return
    const { path, force } = pushPreview
    void runOp('push', async () => {
      const [result] = await api.push(path, false, force)
      setPushPreview(null)
      setMessage({ kind: 'info', text: `${force ? 'Force pushed' : 'Pushed'} ${path} to v${result.version}` })
      setDiff(current => (current?.path === path ? null : current))
      await recheck([path])
    })
  }, [api, pushPreview, recheck, runOp])

  const checkOne = useCallback((path: string) => runOp('check', async () => {
    const results = await api.checkFiles([path])
    applyChecks(results)
    const result = results[0]
    if (result) {
      const state = displayState({ path, tracked: true, check: result })
      setMessage({ kind: 'info', text: `Checked ${path.split('/').at(-1)}: ${STATE_META[state].label}` })
    }
  }), [api, applyChecks, runOp])

  const syncFile = useCallback((path: string) => runOp('sync', async () => {
    // Restrict the title search to the folder's mapped space when one is configured.
    const [result] = await api.sync(path, spaceMapping[path.split('/')[0]])
    const name = path.split('/').at(-1)
    switch (result?.status) {
      case 'linked':
        setMessage({ kind: 'info', text: `Linked ${name} to page ${result.pageId} (${result.space}) v${result.version}` })
        await recheck([path])
        break
      case 'already-linked':
        setMessage({ kind: 'info', text: `${name} already tracks page ${result.pageId}` })
        break
      case 'not-found':
        setMessage({ kind: 'error', text: `No Confluence page titled "${result.title}" — use Create instead` })
        break
      case 'ambiguous':
        setMessage({ kind: 'error', text: `${result.matchCount} pages share the title "${result.title}" — link manually` })
        break
      default:
        setMessage({ kind: 'error', text: `Sync skipped: ${result?.reason ?? 'no result'}` })
    }
  }), [api, recheck, runOp, spaceMapping])

  const submitCreate = useCallback((space: string, parent: string) => {
    if (!createForm) return
    const { path } = createForm
    void runOp('create', async () => {
      const result = await api.create(path, space.trim(), parent.trim() || undefined)
      setCreateForm(null)
      setMessage({ kind: 'info', text: `Created page ${result.pageId} in ${space} — ${result.title}` })
      await recheck([path])
    })
  }, [api, createForm, recheck, runOp])

  const runLint = useCallback((path: string) => runOp('lint', async () => {
    const files = await api.lint(path)
    const issues = files.flatMap(file => file.issues)
    const name = path.split('/').at(-1)
    if (issues.length === 0) {
      setMessage({ kind: 'info', text: `Lint passed — ${name} has no issues` })
    } else {
      const detail = issues.slice(0, 5).map(issue => `${issue.severity} ${issue.rule}: ${issue.message}`)
      if (issues.length > 5) detail.push(`… and ${issues.length - 5} more`)
      setMessage({ kind: 'error', text: `Lint: ${issues.length} issue(s) in ${name}`, detail })
    }
  }), [api, runOp])

  const markVerified = useCallback((path: string) => runOp('verify', async () => {
    const result = await api.recordBaseline(path)
    const name = path.split('/').at(-1)
    if (result.baselineRecorded) {
      setMessage({ kind: 'info', text: `${name} verified — baseline recorded at v${result.remoteVersion}` })
      await recheck([path])
    } else {
      setDiff({ path, result })
      setMessage({ kind: 'error', text: `${name} differs from Confluence — baseline not recorded, review the diff` })
    }
  }), [api, recheck, runOp])

  const verifyAllUnverified = useCallback(() => {
    const targets = [...entries.values()].filter(entry => displayState(entry) === 'unverified').map(entry => entry.path)
    if (targets.length === 0) return
    void runOp('verify', async () => {
      const verified: string[] = []
      let differing = 0
      for (const [index, path] of targets.entries()) {
        setBusyOp(`verify ${index + 1}/${targets.length}`)
        const result = await api.recordBaseline(path).catch(() => null)
        if (result?.baselineRecorded) verified.push(path)
        else differing += 1
      }
      if (verified.length > 0) await recheck(verified)
      setMessage(differing > 0
        ? { kind: 'error', text: `${verified.length} verified; ${differing} differ from Confluence — review them` }
        : { kind: 'info', text: `${verified.length} file(s) verified — baselines recorded` })
    })
  }, [api, entries, recheck, runOp])

  const loadAuthors = useCallback((requests: Array<{ path: string, remoteVersion: number }>) => {
    const missing = requests.filter(request => !authors.has(`${request.path}@v${request.remoteVersion}`))
    if (missing.length === 0) return
    void (async () => {
      for (const request of missing) {
        const entry = await api.lastVersion(request.path).catch(() => null)
        setAuthors(prev => new Map(prev).set(`${request.path}@v${request.remoteVersion}`, entry))
      }
    })()
  }, [api, authors])

  const saveApiKey = useCallback((email: string, apiToken: string) => runOp('save API key', async () => {
    const status = await api.saveApiKey(email, apiToken)
    setAuth(status)
    setMessage(status.ok
      ? { kind: 'info', text: `API key saved — authenticated as ${status.displayName ?? email}` }
      : { kind: 'error', text: status.error ?? 'API key rejected' })
  }), [api, runOp])

  const setAuthMethod = useCallback((method: 'api-token' | 'session-token') => runOp('switch auth', async () => {
    const status = await api.setAuthMethod(method)
    setAuth(status)
    setMessage(status.ok
      ? { kind: 'info', text: `Now using ${method === 'api-token' ? 'the API key' : 'the session token'} (${status.displayName ?? '?'})` }
      : { kind: 'error', text: status.error ?? 'Authentication failed with this method' })
  }), [api, runOp])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    void api.settingsSet(patch).then(setSettings).catch(fail)
  }, [api, fail])

  /** Settings change that alters which files exist in the tree → rescan after. */
  const applyFolderSettings = useCallback(async (patch: Partial<Settings>) => {
    try {
      setSettings(await api.settingsSet(patch))
      const scan = await api.scan()
      setRoot(scan.root)
      mergeScan(scan.files)
    } catch (error) {
      fail(error)
    }
  }, [api, fail, mergeScan])

  const addFolder = useCallback(async () => {
    try {
      const picked = await api.pickFolder()
      if (!picked || !settings) return
      if (settings.contentDirs.includes(picked)) {
        setMessage({ kind: 'info', text: `${picked} is already in the tree` })
        return
      }
      await applyFolderSettings({ contentDirs: [...settings.contentDirs, picked].sort() })
      setMessage({ kind: 'info', text: `Added ${picked} — right-click it to check its files` })
    } catch (error) {
      fail(error)
    }
  }, [api, applyFolderSettings, fail, settings])

  const removeFolder = useCallback((dir: string) => {
    if (!settings) return
    setSelection(current => (current?.startsWith(`${dir}/`) ? null : current))
    void applyFolderSettings({
      contentDirs: settings.contentDirs.filter(entry => entry !== dir),
      pinnedDirs: settings.pinnedDirs.filter(entry => entry !== dir && !entry.startsWith(`${dir}/`)),
    }).then(() => setMessage({ kind: 'info', text: `Removed ${dir} from the tree — add it back in Settings` }))
  }, [applyFolderSettings, settings])

  const togglePin = useCallback((dir: string) => {
    if (!settings) return
    const pinned = settings.pinnedDirs.includes(dir)
      ? settings.pinnedDirs.filter(entry => entry !== dir)
      : [...settings.pinnedDirs, dir]
    updateSettings({ pinnedDirs: pinned })
  }, [settings, updateSettings])

  const setSpaceMappingEntry = useCallback((dir: string, space: string | null) => {
    void api.spaceMappingSet(dir.trim(), space === null ? null : space.trim().toUpperCase())
      .then(setSpaceMapping)
      .catch(fail)
  }, [api, fail])

  const checkFolder = useCallback((dir: string) => {
    const targets = [...entries.values()]
      .filter(entry => entry.tracked && entry.path.startsWith(`${dir}/`))
      .map(entry => entry.path)
    if (targets.length === 0) {
      setMessage({ kind: 'info', text: `No tracked files under ${dir}` })
      return
    }
    void runOp('check folder', async () => {
      applyChecks(await api.checkFiles(targets))
      setMessage({ kind: 'info', text: `Checked ${targets.length} file(s) under ${dir}` })
    })
  }, [api, applyChecks, entries, runOp])

  const reloadVersion = useCallback(() => {
    void api.vdocVersion()
      .then(version => setSettings(current => (current ? { ...current, version } : current)))
      .catch(fail)
  }, [api, fail])

  const saveToken = useCallback((token: string) => runOp('save token', async () => {
    const status = await api.setToken(token)
    setAuth(status)
    if (status.ok) {
      setMessage({ kind: 'info', text: `Authenticated as ${status.displayName ?? 'unknown'}` })
      if (!lastChecked) void checkAll()
    } else {
      setMessage({ kind: 'error', text: status.error ?? 'Token rejected' })
    }
  }), [api, checkAll, lastChecked, runOp])

  const counts = useMemo(() => {
    const result = new Map<DisplayState, number>()
    let attention = 0
    for (const entry of entries.values()) {
      const state = displayState(entry)
      result.set(state, (result.get(state) ?? 0) + 1)
      if (needsAttention(state)) attention += 1
    }
    return { byState: result, attention }
  }, [entries])

  return {
    root,
    entries,
    selection,
    setSelection,
    filterText,
    setFilterText,
    stateFilter,
    setStateFilter,
    auth,
    checking,
    lastChecked,
    busyOp,
    diff,
    diffLoading,
    pushPreview,
    setPushPreview,
    pullConfirm,
    setPullConfirm,
    createForm,
    setCreateForm,
    settings,
    updateSettings,
    reloadVersion,
    addFolder,
    removeFolder,
    togglePin,
    checkFolder,
    openFolder: (path: string) => api.openFolder(path).catch(fail),
    spaceMapping,
    setSpaceMappingEntry,
    revealConfig: () => api.revealConfig().catch(fail),
    authors,
    loadAuthors,
    markVerified,
    verifyAllUnverified,
    saveApiKey,
    setAuthMethod,
    message,
    dismissMessage: () => setMessage(null),
    reportError: fail,
    counts,
    checkAll,
    loadDiff,
    requestPull,
    doPull,
    pullAllBehind,
    requestPush,
    confirmPush,
    checkOne,
    syncFile,
    submitCreate,
    runLint,
    saveToken,
    openConfluence: (path: string) => api.openConfluence(path).catch(fail),
    openEditor: (path: string) => api.openEditor(path).catch(fail),
    revealFinder: (path: string) => api.revealFinder(path).catch(fail),
  }
}

export type AppStore = ReturnType<typeof useApp>
