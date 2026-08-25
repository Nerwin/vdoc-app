import { useEffect, useMemo, useRef, useState } from 'react'

import { FileTree } from './components/FileTree.tsx'
import { DetailPane } from './components/DetailPane.tsx'
import { Dashboard } from './components/Dashboard.tsx'
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
import { applyMonacoTheme } from './components/monaco-setup.ts'
import { commandFor, copy, isMod, selectionState, type CommandContext, type ViewMode } from './commands.ts'
import { useApp } from './useApp.ts'
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
  const [reloadKey, setReloadKey] = useState(0)
  /** Bumped by ⌘F - opens (or refocuses) the preview's find bar. */
  const [findSeq, setFindSeq] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem('sidebarWidth'))
    return saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX ? saved : 306
  })
  const filterRef = useRef<HTMLInputElement>(null)

  const theme = useResolvedTheme(app.settings?.theme ?? 'system')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    applyMonacoTheme(theme)
  }, [theme])

  const totals = useMemo(() => ({
    files: app.entries.size,
    tracked: [...app.entries.values()].filter(entry => entry.tracked).length,
  }), [app.entries])
  const selected = app.selection ? app.entries.get(app.selection) ?? null : null
  const taskRunning = app.checking !== null || app.busyOp !== null
  const connected = app.auth?.ok === true
  const cliOutdated = Boolean(
    app.settings?.version
    && app.settings.cliRequirement
    && isVersionBelowMinimum(app.settings.version, app.settings.cliRequirement.minimumVersion),
  )

  // A new selection starts on Preview - reading is the common case; ⌘1 drops into
  // the editor. A freshly loaded diff takes the stage (see DetailPane).
  useEffect(() => setView('preview'), [app.selection])

  useEffect(() => {
    if (app.selection) setLogsOpen(false)
  }, [app.selection])

  /** OS-native absolute path for pasting outside the app (app-internal paths always use '/'). */
  const absPath = (path: string): string =>
    app.root.includes('\\') ? `${app.root}\\${path.replaceAll('/', '\\')}` : `${app.root}/${path}`

  const openDiff = (): void => {
    if (!app.selection) return
    if (app.diff?.path === app.selection) setView('diff')
    else void app.loadDiff(app.selection, true)
  }

  const ctx: CommandContext = {
    app,
    selection: app.selection,
    entry: selected,
    state: selectionState(selected),
    theme,
    view,
    checking: app.checking !== null,
    busy: app.busyOp !== null,
    connected,
    openPalette: mode => setPalette(mode),
    openSettings: () => setSettingsOpen(true),
    openToken: () => setTokenOpen(true),
    openLogs: () => setLogsOpen(true),
    openHelp: () => setHelpOpen(true),
    openTour: () => setTourOpen(true),
    focusFilter: () => filterRef.current?.focus(),
    setView,
    openDiff,
    openFind: () => setFindSeq(seq => seq + 1),
    toggleSidebar: () => setSidebarOpen(open => !open),
    toggleTheme: () => app.updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' }),
    reloadFile: () => setReloadKey(key => key + 1),
  }
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx

  // Global shortcuts stand down while any dialog is open - each dialog owns its keys.
  const dialogOpen = palette !== null || tokenOpen || settingsOpen || helpOpen
    || app.pushPreview !== null || app.pullConfirm !== null || app.createForm !== null || app.getForm

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
        // Esc clears the active filter first; a second Esc returns to the dashboard.
        const store = ctxRef.current.app
        if (store.filterText !== '' || store.stateFilter !== null) {
          store.setFilterText('')
          store.setStateFilter(null)
        } else {
          store.setSelection(null)
        }
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

  return (
    <div className="flex h-screen flex-col bg-bg font-mono text-[12.5px] text-ink-body">
      <TopBar
        theme={theme}
        filterText={app.filterText}
        behindCount={app.counts.behind}
        unverifiedCount={app.counts.unverified}
        busy={taskRunning}
        connected={connected}
        canGoBack={app.canGoBack}
        canGoForward={app.canGoForward}
        filterRef={filterRef}
        onBack={app.goBack}
        onForward={app.goForward}
        onFilterText={app.setFilterText}
        onPullBehind={app.pullAllBehind}
        onVerifyAll={app.verifyAllUnverified}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenPalette={() => setPalette('command')}
        onOpenDashboard={() => {
          setLogsOpen(false)
          app.setSelection(null)
        }}
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
              totals={totals}
              selection={app.selection}
              filterText={app.filterText}
              stateFilter={app.stateFilter}
              counts={app.counts}
              rootDirs={app.settings?.contentDirs ?? []}
              pinnedDirs={app.settings?.pinnedDirs ?? []}
              onSelect={app.setSelection}
              onFilterState={app.setStateFilter}
              onOpenDiff={path => void app.loadDiff(path, true)}
              onCheckFolder={app.checkFolder}
              onTogglePin={app.togglePin}
              onOpenFolder={path => void app.openFolder(path)}
              onRemoveFolder={app.removeFolder}
              onSetIgnore={(path, ignored) => void app.setIgnored(path, ignored)}
              onCopyPageId={pageId => copy(ctx, pageId, 'Page ID')}
              onCopyPath={path => copy(ctx, absPath(path), 'File path')}
            />
            <div onMouseDown={startSidebarResize} className="absolute inset-y-0 -right-0.5 z-10 w-1 cursor-col-resize" />
          </aside>
        )}
        <main data-tour="main" className="@container min-w-0 flex-1 bg-content">
          {logsOpen
            ? <LogsView notify={app.notify} onClose={() => setLogsOpen(false)} />
            : selected
            ? (
                <DetailPane
                  entry={selected}
                  diff={app.diff}
                  diffLoading={app.diffLoading}
                  busyOp={app.busyOp}
                  theme={theme}
                  connected={connected}
                  view={view}
                  reloadKey={reloadKey}
                  findSeq={findSeq}
                  onView={setView}
                  onError={app.reportError}
                  onHelp={() => setHelpOpen(true)}
                  onSelect={path => {
                    if (app.entries.has(path)) app.setSelection(path)
                    else app.notify(`${path} is not in the tree`)
                  }}
                  onDiff={path => void app.loadDiff(path, true)}
                  onCheck={path => void app.checkOne(path)}
                  onMarkVerified={path => void app.markVerified(path)}
                  onPull={app.requestPull}
                  onForcePull={path => app.setPullConfirm({ paths: [path], force: true })}
                  onPush={(path, force) => void app.requestPush(path, force)}
                  onLint={path => void app.runLint(path)}
                  onSync={path => void app.syncFile(path)}
                  onCreate={path => app.setCreateForm({ path })}
                  onOpenConfluence={path => void app.openConfluence(path)}
                  onOpenEditor={path => void app.openEditor(path)}
                  onRevealFinder={path => void app.revealFinder(path)}
                />
              )
            : (
                <Dashboard
                  entries={app.entries}
                  authors={app.authors}
                  totals={totals}
                  unverifiedCount={app.counts.unverified}
                  busy={app.busyOp !== null}
                  lastChecked={app.lastChecked}
                  recents={app.recents}
                  activity={app.activity}
                  rootDirs={app.settings?.contentDirs ?? []}
                  loadAuthors={app.loadAuthors}
                  onSelect={app.setSelection}
                  onVerifyAll={app.verifyAllUnverified}
                  onCheckAll={() => void app.checkAll()}
                  onOpenFilePalette={() => setPalette('file')}
                  onOpenCommandPalette={() => setPalette('command')}
                  onOpenGetForm={() => app.setGetForm(true)}
                  onFilterFolder={dir => app.setFilterText(`${dir}/`)}
                />
              )}
        </main>
      </div>

      <StatusBar
        auth={app.auth}
        counts={app.counts}
        checking={app.checking}
        lastChecked={app.lastChecked}
        busyOp={app.busyOp}
        appVersion={app.settings?.appVersion ?? null}
        update={app.update}
        stateFilter={app.stateFilter}
        onFilterState={app.setStateFilter}
        onOpenToken={() => setTokenOpen(true)}
        onOpenLogs={() => setLogsOpen(open => !open)}
        onCancelCheck={app.cancelCheck}
        onCheckUpdate={app.checkUpdateNow}
        onOpenUpdate={() => void app.openUpdate()}
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
          title={`${app.pushPreview.force ? 'Force push' : 'Push'} ${app.pushPreview.path.split('/').at(-1)}`}
          onClose={() => app.setPushPreview(null)}
          actions={(
            <>
              <ModalButton label="Cancel" onClick={() => app.setPushPreview(null)} />
              <ModalButton
                label={app.pushPreview.force ? 'Force push - overwrite remote' : 'Push to Confluence'}
                primary={!app.pushPreview.force}
                danger={app.pushPreview.force}
                disabled={app.busyOp === 'push'}
                onClick={app.confirmPush}
              />
            </>
          )}
        >
          {app.pushPreview.force && (
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
          onSaveApiKey={(email, token) => void app.saveApiKey(email, token)}
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
          busy={app.busyOp !== null}
          findExisting={app.fileForPageId}
          onOpenExisting={path => {
            app.setGetForm(false)
            app.setSelection(path)
          }}
          onSubmit={app.submitGet}
          onClose={() => app.setGetForm(false)}
        />
      )}

      {app.pullConfirm && (
        <Modal
          title={app.pullConfirm.force ? 'Overwrite local file?' : `Pull ${app.pullConfirm.paths.length} file(s)`}
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
              This file has (or may have) local edits. Pulling with force replaces the local body with the Confluence
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
                    <span className="text-ink-faint"> v{entry.check.localVersion ?? '-'} → v{entry.check.remoteVersion ?? '-'}</span>
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
    <div className="space-y-1 font-mono text-[12px]">
      <p>Page <span className="text-ink">{preview.pageId}</span> - currently v{preview.version}, push writes v{preview.version + 1}</p>
      <p>{preview.resolvedLinks ?? 0} relative link(s) resolve to Confluence URLs</p>
      {(preview.unresolvedLinks ?? 0) > 0 && (
        <p className="text-warn">{preview.unresolvedLinks} link(s) cannot be resolved and stay as-is</p>
      )}
      <p className="pt-1 text-ink-faint">Dry run verified against the live remote version. The source file is never rewritten - links resolve at push time only.</p>
    </div>
  )
}
