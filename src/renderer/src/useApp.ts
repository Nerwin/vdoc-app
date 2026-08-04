import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { AuthStatus, CheckFile, DiffResult, DisplayState, PushFile, ScanFile, Settings, SettingsInfo } from '../../shared/types.ts'
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
  const [message, setMessage] = useState<Message | null>(null)

  const checkingRef = useRef(false)

  const fail = useCallback((error: unknown) => {
    setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) })
  }, [])

  const applyChecks = useCallback((results: CheckFile[]) => {
    setEntries(prev => {
      const next = new Map(prev)
      for (const result of results) {
        const path = normalize(result.file)
        const entry = next.get(path)
        next.set(path, { path, tracked: entry?.tracked ?? true, check: result })
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
    const [result] = await api.sync(path)
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
  }), [api, recheck, runOp])

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

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    void api.settingsSet(patch).then(setSettings).catch(fail)
  }, [api, fail])

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
    message,
    dismissMessage: () => setMessage(null),
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
