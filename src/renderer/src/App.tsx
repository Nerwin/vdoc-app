import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { FileTree } from './components/FileTree.tsx'
import { DetailPane, type SourceLayout } from './components/DetailPane.tsx'
import { ChangesView } from './components/ChangesView.tsx'
import { ConflictView } from './components/ConflictView.tsx'
import { StatusBar } from './components/StatusBar.tsx'
import { TopBar } from './components/TopBar.tsx'
import { TokenPanel } from './components/TokenPanel.tsx'
import { CommandPalette } from './components/CommandPalette.tsx'
import { CreateForm } from './components/CreateForm.tsx'
import { GetForm } from './components/GetForm.tsx'
import { SettingsModal } from './components/SettingsModal.tsx'
import { LogsView } from './components/LogsView.tsx'
import { HelpModal } from './components/HelpModal.tsx'
import { Tour } from './components/Tour.tsx'
import { Toast } from './components/Toast.tsx'
import { Modal, ModalButton } from './components/Modal.tsx'
import { CliVersionWarning } from './components/CliVersionWarning.tsx'
import { absolutePath, commandFor, copy, isMod, selectionState, type CommandContext, type SidebarMode, type ViewMode } from './commands.ts'
import { useApp } from './useApp.ts'
import { cliStatus, documentOf, worstOutcome } from '../../shared/cli-status.ts'
import { isVersionBelowMinimum } from '../../shared/version.ts'

const SIDEBAR_MIN = 240
const SIDEBAR_MAX = 480
const clampSidebar = (width: number): number => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width))

/** Resolves `system` against the OS appearance, and follows it while it is selected. */
function useResolvedTheme(preference: 'dark' | 'light' | 'system'): 'dark' | 'light' {
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent): void => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference
}

export function App() {
  const app = useApp()
  const [tokenOpen, setTokenOpen] = useState(false)
  const [palette, setPalette] = useState<'file' | 'command' | 'recent' | 'search' | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(() => localStorage.getItem('tourSeen') === null)
  const [view, setView] = useState<ViewMode>('preview')
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('all')
  const [infoOpen, setInfoOpen] = useState(() => localStorage.getItem('infoPanel') !== '0')
  /** The document under per-hunk conflict review, when any. */
  const [resolving, setResolving] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  /** Bumped by ⌘F - opens (or refocuses) the preview's find bar. */
  const [findSeq, setFindSeq] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem('sidebarWidth'))
    return saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX ? saved : 258
  })
  const editorFlushRef = useRef<() => Promise<boolean>>(async () => true)

  const registerEditorFlush = useCallback((flush: (() => Promise<boolean>) | null) => {
    editorFlushRef.current = flush ?? (async () => true)
  }, [])

  useEffect(() => window.vdoc.onCloseRequested(() => {
    void (async () => {
      let saved = false
      try {
        saved = await editorFlushRef.current()
      } catch (error) {
        app.reportError(error)
      }
      await window.vdoc.closeReady(saved).catch(app.reportError)
    })()
  }), [app.reportError])

  const theme = useResolvedTheme(app.settings?.theme ?? 'system')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // The Source tab layout persists per workspace.
  const layoutKey = `sourceLayout:${app.root}`
  const [sourceLayout, setSourceLayoutState] = useState<SourceLayout>('content')
  useEffect(() => {
    setSourceLayoutState(localStorage.getItem(layoutKey) === 'split' ? 'split' : 'content')
  }, [layoutKey])
  const setSourceLayout = (layout: SourceLayout): void => {
    localStorage.setItem(layoutKey, layout)
    setSourceLayoutState(layout)
  }

  const toggleInfo = (): void => setInfoOpen(open => {
    localStorage.setItem('infoPanel', open ? '0' : '1')
    return !open
  })

  const selected = app.selection ? app.entries.get(app.selection) ?? null : null
  const taskRunning = app.checking !== null || app.busyOp !== null
  const connected = app.auth?.ok === true
  const cliOutdated = Boolean(
    app.settings?.version
    && app.settings.cliRequirement
    && isVersionBelowMinimum(app.settings.version, app.settings.cliRequirement.minimumVersion),
  )
  const known = useCallback((path: string) => app.entries.has(path), [app.entries])
  const cliOutcome = useMemo(() => worstOutcome(app.logs.map(entry => cliStatus(entry).outcome)), [app.logs])
  const lastCli = useMemo(
    () => (selected ? [...app.logs].reverse().find(entry => documentOf(entry.args, known) === selected.path) : undefined),
    [app.logs, known, selected],
  )
  const lastSync = selected ? app.activity.find(event => event.path === selected.path) : undefined

  // A new selection starts on Preview - reading is the common case - and leaves any conflict review.
  useEffect(() => {
    setView('preview')
    setResolving(current => (current === app.selection ? current : null))
  }, [app.selection])

  const openDiff = (path: string): void => {
    app.setSelection(path)
    setResolving(null)
    if (app.diff?.path === path) setView('diff')
    else void app.loadDiff(path, true)
  }

  const openResolve = (path: string): void => {
    app.setSelection(path)
    setResolving(path)
    if (app.diff?.path !== path) void app.loadDiff(path, true)
  }

  const ctx: CommandContext = {
    app,
    selection: app.selection,
    entry: selected,
    state: selectionState(selected),
    theme,
    view,
    sidebarMode,
    checking: app.checking !== null,
    busy: app.busyOp !== null,
    connected,
    openPalette: mode => setPalette(mode),
    openSettings: () => setSettingsOpen(true),
    openToken: () => setTokenOpen(true),
    openLogs: () => setLogsOpen(open => !open),
    openHelp: () => setHelpOpen(true),
    openTour: () => setTourOpen(true),
    setView,
    setSidebarMode: mode => {
      setSidebarMode(mode)
      setSidebarOpen(true)
    },
    openChanges: scope => {
      setResolving(null)
      app.openChanges(scope)
    },
    openDiff,
    openResolve,
    openFind: () => setFindSeq(seq => seq + 1),
    toggleSidebar: () => setSidebarOpen(open => !open),
    toggleInfo,
    toggleTheme: () => app.updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' }),
    reloadFile: () => setReloadKey(key => key + 1),
  }
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx

  // Global shortcuts stand down while any dialog is open - each dialog owns its keys.
  const dialogOpen = palette !== null || tokenOpen || settingsOpen || helpOpen || logsOpen
    || app.pushPreview !== null || app.pullConfirm !== null || app.createForm !== null || app.getForm !== null

  useEffect(() => {
    if (dialogOpen) return
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const inField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      // Every binding comes from the registry; a command only fires when it is available.
      if (!inField || isMod(event)) {
        const command = commandFor(event, ctxRef.current)
        if (command) {
          event.preventDefault()
          command.run(ctxRef.current)
          return
        }
      }
      if (event.key === 'Escape' && !inField) {
        // Esc goes back: document → Changes, scoped Changes → all changes.
        const store = ctxRef.current.app
        if (store.selection !== null) store.openChanges(store.changesScope)
        else store.setChangesScope(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialogOpen])

  const startSidebarResize = (event: React.MouseEvent): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth
    const widthAt = (clientX: number): number => clampSidebar(startWidth + clientX - startX)
    const onMove = (move: MouseEvent): void => setSidebarWidth(widthAt(move.clientX))
    const onUp = (up: MouseEvent): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      localStorage.setItem('sidebarWidth', String(widthAt(up.clientX)))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const remotePaths = (): string[] => [...app.entries.values()]
    .filter(entry => entry.tracked && !entry.ignored && entry.check?.state === 'behind')
    .map(entry => entry.path)

  return (
    <div className="flex h-screen flex-col bg-bg font-sans text-[12.5px] text-ink-body">
      <TopBar
        theme={theme}
        remoteCount={app.counts.remote}
        busy={taskRunning}
        connected={connected}
        canGoBack={app.canGoBack}
        canGoForward={app.canGoForward}
        onBack={app.goBack}
        onForward={app.goForward}
        onPullAll={() => app.pullAll(remotePaths())}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSearch={() => setPalette('file')}
        onOpenChanges={() => ctx.openChanges()}
      />

      {cliOutdated && app.settings?.version && app.settings.cliRequirement && (
        <CliVersionWarning
          currentVersion={app.settings.version}
          requirement={app.settings.cliRequirement}
          onOpenSettings={() => setSettingsOpen(true)}
          onNotify={app.notify}
          onOpenExternal={url => void window.vdoc.openExternal(url).catch(app.reportError)}
        />
      )}

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <aside data-tour="tree" style={{ width: sidebarWidth }} className="relative shrink-0 border-r border-line bg-sidebar">
            <FileTree
              entries={app.entries}
              counts={app.counts}
              mode={sidebarMode}
              selection={app.selection}
              rootDirs={app.settings?.contentDirs ?? []}
              pinnedDirs={app.settings?.pinnedDirs ?? []}
              onSetMode={ctx.setSidebarMode}
              onSelect={app.setSelection}
              onOpenDiff={openDiff}
              onCheckFolder={app.checkFolder}
              onTogglePin={app.togglePin}
              onSetPinned={(path, pinned) => void app.setPinned(path, pinned)}
              onOpenFolder={path => void app.openFolder(path)}
              onGetPage={path => app.setGetForm({ dir: path })}
              onRemoveFolder={app.removeFolder}
              onSetIgnore={(path, ignored) => void app.setIgnored(path, ignored)}
              onCopyPageId={pageId => copy(ctx, pageId, 'Page ID')}
              onCopyPath={path => copy(ctx, absolutePath(app.root, path), 'Document path')}
            />
            <div onMouseDown={startSidebarResize} className="absolute inset-y-0 -right-0.5 z-10 w-1 cursor-col-resize" />
          </aside>
        )}
        <main data-tour="main" className="@container min-w-0 flex-1 bg-content">
          {selected && resolving === selected.path
            ? (
                <ConflictView
                  entry={selected}
                  diff={app.diff?.path === selected.path ? app.diff.result : null}
                  author={selected.check?.remoteVersion !== undefined ? app.authors.get(`${selected.path}@v${selected.check.remoteVersion}`) : undefined}
                  busy={app.busyOp !== null}
                  onBack={() => ctx.openChanges()}
                  onError={app.reportError}
                  onMergeAndPush={(expected, merged) => {
                    setResolving(null)
                    void app.mergeAndPush(selected.path, expected, merged)
                  }}
                />
              )
            : selected
              ? (
                  <DetailPane
                    ctx={ctx}
                    entry={selected}
                    diff={app.diff}
                    diffLoading={app.diffLoading}
                    busyOp={app.busyOp}
                    theme={theme}
                    connected={connected}
                    lastChecked={app.lastChecked}
                    lastSync={lastSync}
                    lastCli={lastCli}
                    view={view}
                    sourceLayout={sourceLayout}
                    infoOpen={infoOpen}
                    reloadKey={reloadKey}
                    findSeq={findSeq}
                    onView={setView}
                    onSourceLayout={setSourceLayout}
                    onToggleInfo={toggleInfo}
                    onOpenLogs={() => setLogsOpen(true)}
                    onError={app.reportError}
                    onRegisterFlush={registerEditorFlush}
                    onHelp={() => setHelpOpen(true)}
                    onSelect={path => {
                      if (app.entries.has(path)) app.setSelection(path)
                      else app.notify(`${path} is not in the tree`)
                    }}
                    onDiff={openDiff}
                    onMarkVerified={path => void app.markVerified(path)}
                    onLint={path => void app.runLint(path)}
                  />
                )
              : (
                  <ChangesView
                    ctx={ctx}
                    entries={app.entries}
                    counts={app.counts}
                    authors={app.authors}
                    checking={app.checking}
                    lastChecked={app.lastChecked}
                    busy={app.busyOp !== null}
                    scope={app.changesScope}
                    bulkResult={app.bulkResult}
                    loadAuthors={app.loadAuthors}
                    onReview={openDiff}
                    onResolve={openResolve}
                    onPullAll={app.pullAll}
                    onPushAll={app.pushAll}
                    onCheckAll={() => void app.checkAll()}
                    onCancelCheck={app.cancelCheck}
                    onCheckUnchecked={app.checkUnchecked}
                    onClearScope={() => app.setChangesScope(null)}
                  />
                )}
        </main>
      </div>

      <StatusBar
        auth={app.auth}
        site={app.settings?.site ?? null}
        counts={app.counts}
        checking={app.checking}
        busyOp={app.busyOp}
        appVersion={app.settings?.appVersion ?? null}
        update={app.update}
        cliOutcome={cliOutcome}
        onOpenChanges={scope => ctx.openChanges(scope)}
        onOpenToken={() => setTokenOpen(true)}
        onOpenLogs={() => setLogsOpen(open => !open)}
        onCancelCheck={app.cancelCheck}
        onCheckUpdate={app.checkUpdateNow}
        onInstallUpdate={() => void app.installUpdate()}
      />

      {app.message && <Toast message={app.message} onDismiss={app.dismissMessage} />}

      {tourOpen && (
        <Tour
          ctx={ctx}
          onClose={() => {
            localStorage.setItem('tourSeen', '1')
            setTourOpen(false)
          }}
        />
      )}

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      {logsOpen && (
        <LogsView
          entries={app.logs}
          known={known}
          selection={app.selection}
          notify={app.notify}
          onOpenDocument={path => {
            setLogsOpen(false)
            app.setSelection(path)
          }}
          onClose={() => setLogsOpen(false)}
        />
      )}

      {palette !== null && (
        <CommandPalette
          ctx={ctx}
          entries={app.entries}
          mode={palette}
          recents={app.recents.map(visit => visit.path).filter(path => app.entries.has(path))}
          onPick={path => {
            app.setSelection(path)
            setPalette(null)
          }}
          onRun={command => {
            setPalette(null)
            command.run(ctx)
          }}
          onClose={() => setPalette(null)}
        />
      )}

      {tokenOpen && (
        <TokenPanel
          auth={app.auth}
          busy={app.busyOp !== null}
          onSave={token => {
            void app.saveToken(token)
            setTokenOpen(false)
          }}
          onClose={() => setTokenOpen(false)}
        />
      )}

      {app.pushPreview && (
        <Modal
          title={`${app.pushPreview.allowLossy ? 'Push force' : app.pushPreview.force ? 'Force push' : 'Push'} ${app.pushPreview.path.split('/').at(-1)}${app.pushQueue.length > 0 ? ` · ${app.pushQueue.length} more queued` : ''}`}
          onClose={app.cancelPushPreview}
          actions={(
            <>
              <ModalButton label={app.pushQueue.length > 0 ? 'Cancel all' : 'Cancel'} onClick={app.cancelPushPreview} />
              <ModalButton
                label={app.pushPreview.allowLossy ? 'Push force - overwrite remote' : app.pushPreview.force ? 'Force push - overwrite remote' : 'Push to Confluence'}
                primary={!app.pushPreview.force && !app.pushPreview.allowLossy}
                danger={app.pushPreview.force || app.pushPreview.allowLossy}
                disabled={app.busyOp === 'push'}
                onClick={app.confirmPush}
              />
            </>
          )}
        >
          {app.pushPreview.allowLossy ? (
            <p className="mb-2 text-conflict">
              Push force will completely overwrite the remote page with this local file.
              Unsupported layouts, media, or macros not preserved locally will be deleted. This cannot be undone by V-DOC.
            </p>
          ) : app.pushPreview.force && (
            <p className="mb-2 text-conflict">
              Confluence moved to v{app.pushPreview.result.version} since this file was last pulled
              (it records v{app.entries.get(app.pushPreview.path)?.check?.localVersion ?? '-'}).
              Force pushing replaces the remote edits with your local content - compare first if unsure.
            </p>
          )}
          <DryRunSummary preview={app.pushPreview.result} />
        </Modal>
      )}

      {settingsOpen && app.settings && (
        <SettingsModal
          settings={app.settings}
          auth={app.auth}
          busy={app.busyOp !== null}
          spaceMapping={app.spaceMapping}
          onUpdate={app.updateSettings}
          onSetAssetsDir={app.setAssetsDir}
          onSetSite={app.setSite}
          onReloadVersion={app.reloadVersion}
          onSaveApiKey={token => void app.saveApiKey(token)}
          onSetAuthMethod={method => void app.setAuthMethod(method)}
          onCredentialPreview={app.credentialPreview}
          onClearCredential={key => void app.clearCredential(key)}
          onAddFolder={() => void app.addFolder()}
          onPickDocsRoot={() => void app.pickDocsRoot()}
          onRemoveFolder={app.removeFolder}
          onSetSpaceMapping={app.setSpaceMappingEntry}
          onRevealConfig={() => void app.revealConfig()}
          onEditConfig={() => void app.editConfig()}
          onRenewToken={() => {
            setSettingsOpen(false)
            setTokenOpen(true)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {app.createForm && (
        <CreateForm
          path={app.createForm.path}
          defaultSpace={app.spaceMapping[app.createForm.path.split('/')[0]] ?? ''}
          busy={app.busyOp !== null}
          onSubmit={app.submitCreate}
          onClose={() => app.setCreateForm(null)}
        />
      )}

      {app.getForm && (
        <GetForm
          folders={app.settings?.contentDirs ?? []}
          presetDir={app.getForm.dir}
          busy={app.busyOp !== null}
          findExisting={app.fileForPageId}
          onOpenExisting={path => {
            app.setGetForm(null)
            app.setSelection(path)
          }}
          onSubmit={app.submitGet}
          onClose={() => app.setGetForm(null)}
        />
      )}

      {app.pullConfirm && (
        <Modal
          title={app.pullConfirm.force ? 'Overwrite local document?' : `Pull ${app.pullConfirm.paths.length} document(s)`}
          onClose={() => app.setPullConfirm(null)}
          actions={(
            <>
              <ModalButton label="Cancel" onClick={() => app.setPullConfirm(null)} />
              <ModalButton
                label={app.pullConfirm.force ? 'Overwrite local' : 'Pull'}
                primary={!app.pullConfirm.force}
                danger={app.pullConfirm.force}
                disabled={app.busyOp === 'pull'}
                onClick={() => void app.doPull(app.pullConfirm!.paths, app.pullConfirm!.force)}
              />
            </>
          )}
        >
          {app.pullConfirm.force && (
            <p className="mb-2 text-conflict">
              This document has (or may have) local changes. Pulling with force replaces the local body with the Confluence
              version - compare first if unsure.
            </p>
          )}
          <ul className="space-y-0.5 font-mono text-[11px]">
            {app.pullConfirm.paths.map(path => {
              const entry = app.entries.get(path)
              return (
                <li key={path} className="truncate">
                  {path}
                  {entry?.check && (
                    <span className="text-ink-label"> v{entry.check.localVersion ?? '-'} → v{entry.check.remoteVersion ?? '-'}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </Modal>
      )}
    </div>
  )
}

function DryRunSummary({ preview }: { preview: { pageId: string, version: number, resolvedLinks?: number, unresolvedLinks?: number } }) {
  return (
    <div className="space-y-1 text-[12px]">
      <p>Page <span className="font-mono text-ink">{preview.pageId}</span> - currently v{preview.version}, push writes v{preview.version + 1}</p>
      <p>{preview.resolvedLinks ?? 0} relative link(s) resolve to Confluence URLs</p>
      {(preview.unresolvedLinks ?? 0) > 0 && (
        <p className="text-warn">{preview.unresolvedLinks} link(s) cannot be resolved and stay as-is</p>
      )}
      <p className="pt-1 text-ink-label">Dry run verified against the live remote version. The source file is never rewritten - links resolve at push time only.</p>
    </div>
  )
}
