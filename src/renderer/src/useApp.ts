import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { AuthStatus, CheckFile, DiffResult, PushFile, ScanFile, Settings, SettingsInfo, TriageFilter, VersionEntry } from '../../shared/types.ts'
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

export interface Visit {
  path: string
  at: number
}

export interface SyncEvent {
  op: 'pulled' | 'pushed' | 'fetched'
  path: string
  at: number
}

const normalize = (path: string): string => path.replace(/^\.\//, '')

function loadJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T
  } catch {
    return fallback
  }
}

/** Persisted check results — sync state survives restarts, keyed to the docs root. */
const CHECKS_KEY = 'checkState'

interface SavedChecks {
  root: string
  /** Epoch ms of the last full check, when one ran — restored into “last checked”. */
  at: number | null
  results: CheckFile[]
}

/** A full re-check runs at most once per hour on window focus. */
const FULL_CHECK_TTL_MS = 60 * 60 * 1000
/** Focus-triggered partial re-checks are throttled to once a minute. */
const FOCUS_THROTTLE_MS = 60 * 1000

export function useApp() {
  const api = window.vdoc

  const [root, setRoot] = useState('')
  const [entries, setEntries] = useState<Map<string, FileEntry>>(new Map())
  const [selection, setSelection] = useState<string | null>(null)
  /** Files navigated away from, oldest first — Back pops from the end. */
  const [history, setHistory] = useState<string[]>([])
  /** Files backed out of — Forward pops from the end; any new navigation clears it. */
  const [forward, setForward] = useState<string[]>([])
  const [filterText, setFilterText] = useState('')
  const [stateFilter, setStateFilter] = useState<TriageFilter>(null)
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [checking, setChecking] = useState<{ done: number, total: number } | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [busyOp, setBusyOp] = useState<string | null>(null)
  const [diff, setDiff] = useState<{ path: string, result: DiffResult } | null>(null)
  const [diffLoading, setDiffLoading] = useState<string | null>(null)
  const [pushPreview, setPushPreview] = useState<PushPreview | null>(null)
  const [pullConfirm, setPullConfirm] = useState<PullConfirm | null>(null)
  const [createForm, setCreateForm] = useState<{ path: string } | null>(null)
  const [getForm, setGetForm] = useState(false)
  const [settings, setSettings] = useState<SettingsInfo | null>(null)
  const [spaceMapping, setSpaceMapping] = useState<Record<string, string>>({})
  /** Latest remote version info per file, keyed `path@vN` so a new version refetches. */
  const [authors, setAuthors] = useState<Map<string, VersionEntry | null>>(new Map())
  const [message, setMessage] = useState<Message | null>(null)

  /** Recently opened files, newest first — feeds the dashboard's Continue reading. */
  const [recents, setRecents] = useState<Visit[]>(() => loadJson('recentFiles', []))
  /** Last few pulls / pushes / gets — the dashboard's sync-activity card. */
  const [activity, setActivity] = useState<SyncEvent[]>(() => loadJson('syncActivity', []))

  const checkingRef = useRef(false)
  const lastFocusCheckRef = useRef(0)

  const recordActivity = useCallback((op: SyncEvent['op'], paths: string[]) => {
    if (paths.length === 0) return
    setActivity(prev => {
      const at = Date.now()
      const next = [...paths.map(path => ({ op, path, at })), ...prev].slice(0, 6)
      localStorage.setItem('syncActivity', JSON.stringify(next))
      return next
    })
  }, [])

  /** Every navigation (tree, palette, dashboard, links) records the file it leaves. */
  const select = useCallback((path: string | null) => {
    if (path !== selection && selection !== null) setHistory(stack => [...stack.slice(-19), selection])
    if (path !== null) {
      if (path !== selection) setForward([])
      setRecents(prev => {
        const next = [{ path, at: Date.now() }, ...prev.filter(visit => visit.path !== path)].slice(0, 20)
        localStorage.setItem('recentFiles', JSON.stringify(next))
        return next
      })
    }
    setSelection(path)
  }, [selection])

  const goBack = useCallback(() => {
    // Pop entries whose file has since left the tree.
    const stack = [...history]
    let target: string | undefined
    while ((target = stack.pop()) !== undefined && !entries.has(target)) continue
    setHistory(stack)
    if (target !== undefined) {
      if (selection !== null) setForward(next => [...next, selection])
      // Going back is not a new visit — bypass the recording wrapper.
      setSelection(target)
    }
  }, [entries, history, selection])

  const goForward = useCallback(() => {
    const stack = [...forward]
    let target: string | undefined
    while ((target = stack.pop()) !== undefined && !entries.has(target)) continue
    setForward(stack)
    if (target !== undefined) {
      if (selection !== null) setHistory(prev => [...prev.slice(-19), selection])
      setSelection(target)
    }
  }, [entries, forward, selection])

  const fail = useCallback((error: unknown) => {
    const raw = error instanceof Error ? error.message : String(error)
    // Electron wraps IPC rejections: "Error invoking remote method 'x': Error: <real message>"
    const text = raw.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
    setMessage({ kind: 'error', text })
  }, [])

  // Anything that escapes the per-action catches still surfaces as a toast.
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent): void => fail(event.reason)
    window.addEventListener('unhandledrejection', onRejection)
    return () => window.removeEventListener('unhandledrejection', onRejection)
  }, [fail])

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

  // Initial load: tree first (fast, local), then the auth probe. Checking is never
  // automatic — the first check is always a deliberate click (or ⌘⇧R).
  useEffect(() => {
    void (async () => {
      try {
        const scan = await api.scan()
        setRoot(scan.root)
        mergeScan(scan.files)
        // Restore the last session's check results (age shown as "last checked …";
        // the focus refresh re-checks when they are over an hour old).
        const saved = loadJson<SavedChecks | null>(CHECKS_KEY, null)
        if (saved?.root === scan.root && Array.isArray(saved.results)) {
          const tracked = new Set(scan.files.filter(file => file.tracked).map(file => file.path))
          const results = saved.results.filter(result => tracked.has(normalize(result.file)))
          if (results.length > 0) {
            applyChecks(results)
            if (saved.at) setLastChecked(new Date(saved.at))
          }
        }
        const status = await api.authStatus()
        setAuth(status)
        if (!status.ok) setMessage({ kind: 'error', text: status.error ?? 'Confluence authentication failed' })
      } catch (error) {
        fail(error)
      }
    })()
  }, [api, applyChecks, fail, mergeScan])

  // Persist whatever check results exist — full checks, single files, folder checks.
  // An empty result set never overwrites a saved snapshot (startup runs before restore).
  useEffect(() => {
    if (root === '') return
    const results = [...entries.values()].flatMap(entry => (entry.tracked && entry.check ? [entry.check] : []))
    if (results.length === 0) return
    localStorage.setItem(CHECKS_KEY, JSON.stringify({ root, at: lastChecked?.getTime() ?? null, results } satisfies SavedChecks))
  }, [entries, lastChecked, root])

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

  // On window focus: refresh what a check (this session or restored) already established —
  // full re-check when over an hour old, otherwise just the files needing attention.
  useEffect(() => {
    const onFocus = (): void => {
      if (checkingRef.current || busyOp || !lastChecked) return
      const now = Date.now()
      if (now - lastFocusCheckRef.current < FOCUS_THROTTLE_MS) return
      lastFocusCheckRef.current = now

      if (now - lastChecked.getTime() > FULL_CHECK_TTL_MS) {
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
    const pulled = results.filter(result => result.status === 'pulled' || result.status === 'updated')
    // Files that did NOT update are the interesting part — say why, per file.
    const skipped = results.filter(result => !pulled.includes(result))
    const detail = skipped.slice(0, 5).map(result => `${normalize(result.file).split('/').at(-1)} — ${result.summary ?? result.status}`)
    if (skipped.length > 5) detail.push(`… and ${skipped.length - 5} more`)
    setMessage({ kind: 'info', text: `Pull: ${pulled.length}/${results.length} file(s) updated`, detail: detail.length > 0 ? detail : undefined })
    recordActivity('pulled', pulled.map(result => normalize(result.file)))
    setDiff(current => (current && paths.includes(current.path) ? null : current))
    await recheck(paths)
  }), [api, recheck, recordActivity, runOp])

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
      recordActivity('pushed', [path])
      setMessage({ kind: 'info', text: `${force ? 'Force pushed' : 'Pushed'} ${path} to v${result.version}` })
      setDiff(current => (current?.path === path ? null : current))
      await recheck([path])
    })
  }, [api, pushPreview, recheck, recordActivity, runOp])

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

  const submitGet = useCallback((input: string, dir: string) => runOp('get', async () => {
    const result = await api.getPage(input.trim(), dir)
    setGetForm(false)
    // The watcher also fires, but rescan now so the new file can be selected immediately.
    const scan = await api.scan()
    setRoot(scan.root)
    mergeScan(scan.files)
    const path = normalize(result.file ?? '')
    setMessage({ kind: 'info', text: `Fetched "${result.title}" (v${result.version}) → ${path}` })
    if (scan.files.some(file => file.path === path)) {
      recordActivity('fetched', [path])
      select(path)
      await recheck([path])
    }
  }), [api, mergeScan, recheck, recordActivity, runOp, select])

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
      setMessage({ kind: 'error', text: `${name} has the same version but different content — no baseline recorded. Review the diff, then Pull (take Confluence) or Push (publish local).` })
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

  const pickDocsRoot = useCallback(async () => {
    try {
      const picked = await api.pickDocsRoot()
      if (!picked) return
      setSelection(null)
      await applyFolderSettings({ docsRoot: picked })
      setMessage({ kind: 'info', text: `Docs repository is now ${picked}` })
    } catch (error) {
      fail(error)
    }
  }, [api, applyFolderSettings, fail])

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
    setMessage(status.ok
      ? { kind: 'info', text: `Authenticated as ${status.displayName ?? 'unknown'}` }
      : { kind: 'error', text: status.error ?? 'Token rejected' })
  }), [api, runOp])

  const counts = useMemo(() => {
    let attention = 0
    let behind = 0
    let unverified = 0
    let dirty = 0
    for (const entry of entries.values()) {
      const state = displayState(entry)
      if (needsAttention(state)) attention += 1
      if (state === 'behind') behind += 1
      if (state === 'unverified') unverified += 1
      if (entry.gitDirty) dirty += 1
    }
    return { attention, behind, unverified, dirty }
  }, [entries])

  const cancelCheck = useCallback(() => {
    void api.checkCancel().catch(fail)
  }, [api, fail])

  return {
    root,
    entries,
    selection,
    setSelection: select,
    recents,
    activity,
    goBack,
    canGoBack: history.length > 0,
    goForward,
    canGoForward: forward.length > 0,
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
    getForm,
    setGetForm,
    submitGet,
    fileForPageId: (pageId: string) => api.fileForPageId(pageId).catch(error => {
      fail(error)
      return null
    }),
    settings,
    updateSettings,
    reloadVersion,
    addFolder,
    pickDocsRoot,
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
    notify: (text: string) => setMessage({ kind: 'info', text }),
    reportError: fail,
    counts,
    checkAll,
    cancelCheck,
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
    openConfluence: (path: string) => api.confluenceUrl(path).then(url => api.openExternal(url)).catch(fail),
    confluenceUrl: (path: string) => api.confluenceUrl(path).catch(error => {
      fail(error)
      return null
    }),
    quit: () => api.quit(),
    openEditor: (path: string) => api.openEditor(path).catch(fail),
    revealFinder: (path: string) => api.revealFinder(path).catch(fail),
  }
}

export type AppStore = ReturnType<typeof useApp>
