import { useEffect, useMemo, useRef, useState } from 'react'

import { FileTree } from './components/FileTree.tsx'
import { DetailPane } from './components/DetailPane.tsx'
import { StatusBar } from './components/StatusBar.tsx'
import { TokenPanel } from './components/TokenPanel.tsx'
import { CommandPalette } from './components/CommandPalette.tsx'
import { CreateForm } from './components/CreateForm.tsx'
import { SettingsModal } from './components/SettingsModal.tsx'
import { Toast } from './components/Toast.tsx'
import { Modal, ModalButton } from './components/Modal.tsx'
import { applyMonacoTheme } from './components/monaco-setup.ts'
import { useApp } from './useApp.ts'

/** Folder → Confluence space defaults, from the repo's space mapping. */
const SPACE_BY_DIR: Record<string, string> = { '1-Backend': 'BACK', '2-DDA': 'BDA' }

export function App() {
  const app = useApp()
  const [tokenOpen, setTokenOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const filterRef = useRef<HTMLInputElement>(null)

  const theme = app.settings?.theme ?? 'dark'
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    applyMonacoTheme(theme)
  }, [theme])

  const behindCount = app.counts.byState.get('behind') ?? 0
  const totals = useMemo(() => ({
    files: app.entries.size,
    tracked: [...app.entries.values()].filter(entry => entry.tracked).length,
  }), [app.entries])
  const selected = app.selection ? app.entries.get(app.selection) ?? null : null

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey) return
      if (event.key === 'r') {
        event.preventDefault()
        void app.checkAll()
      }
      if (event.key === 'f') {
        event.preventDefault()
        filterRef.current?.focus()
      }
      if (event.key === 'p') {
        event.preventDefault()
        setPaletteOpen(true)
      }
      if (event.key === ',') {
        event.preventDefault()
        setSettingsOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [app.checkAll])

  return (
    <div className="flex h-screen flex-col bg-bg font-sans text-[13px] text-ink">
      <header className="drag-region flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel pl-20 pr-3">
        <span className="select-none font-mono text-[13px] font-semibold tracking-[0.18em] text-ink">
          V<span className="text-accent">-</span>DOC
        </span>
        <span className="truncate rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-ink-faint">
          {app.root.split('/').slice(-1)[0]}
        </span>
        <input
          ref={filterRef}
          value={app.filterText}
          onChange={event => app.setFilterText(event.target.value)}
          onKeyDown={event => event.key === 'Escape' && app.setFilterText('')}
          placeholder="Filter files… ⌘F"
          spellCheck={false}
          className="mx-auto w-64 rounded-md border border-line bg-bg px-2.5 py-1 font-mono text-[11px] text-ink placeholder-ink-faint outline-none focus:border-accent"
        />
        {behindCount > 0 && (
          <button
            onClick={app.pullAllBehind}
            disabled={app.busyOp !== null}
            className="rounded-md border border-behind/40 px-2.5 py-1 text-[12px] text-behind hover:bg-behind/10 disabled:opacity-40"
          >
            Pull behind ({behindCount})
          </button>
        )}
        <button
          onClick={() => void app.checkAll()}
          disabled={app.checking !== null}
          className="rounded-md border border-line bg-raised px-2.5 py-1 text-[12px] text-ink hover:bg-line disabled:opacity-40"
        >
          {app.checking ? 'Checking…' : 'Check all'}
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings — ⌘,"
          className="rounded-md border border-line bg-panel px-2 py-1 text-[12px] text-ink-dim hover:bg-raised hover:text-ink"
        >
          ⚙
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 border-r border-line bg-panel/50">
          <FileTree
            entries={app.entries}
            selection={app.selection}
            filterText={app.filterText}
            stateFilter={app.stateFilter}
            onSelect={app.setSelection}
            onOpenDiff={path => void app.loadDiff(path, true)}
          />
        </aside>
        <main className="min-w-0 flex-1">
          <DetailPane
            entry={selected}
            totals={totals}
            diff={app.diff}
            diffLoading={app.diffLoading}
            busyOp={app.busyOp}
            onDiff={path => void app.loadDiff(path, true)}
            onCheck={path => void app.checkOne(path)}
            onPull={app.requestPull}
            onPush={(path, force) => void app.requestPush(path, force)}
            onLint={path => void app.runLint(path)}
            onSync={path => void app.syncFile(path)}
            onCreate={path => app.setCreateForm({ path })}
            onOpenConfluence={path => void app.openConfluence(path)}
            onOpenEditor={path => void app.openEditor(path)}
            onRevealFinder={path => void app.revealFinder(path)}
          />
        </main>
      </div>

      <StatusBar
        auth={app.auth}
        counts={app.counts}
        checking={app.checking}
        lastChecked={app.lastChecked}
        busyOp={app.busyOp}
        stateFilter={app.stateFilter}
        onFilterState={app.setStateFilter}
        onOpenToken={() => setTokenOpen(true)}
      />

      {app.message && <Toast message={app.message} onDismiss={app.dismissMessage} />}

      {paletteOpen && (
        <CommandPalette
          entries={app.entries}
          onPick={path => {
            app.setSelection(path)
            setPaletteOpen(false)
          }}
          onClose={() => setPaletteOpen(false)}
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
                label={app.pushPreview.force ? 'Force push — overwrite remote' : 'Push to Confluence'}
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
              (it records v{app.entries.get(app.pushPreview.path)?.check?.localVersion ?? '—'}).
              Force pushing replaces the remote edits with your local content — compare first if unsure.
            </p>
          )}
          <DryRunSummary preview={app.pushPreview.result} />
        </Modal>
      )}

      {settingsOpen && app.settings && (
        <SettingsModal
          settings={app.settings}
          busy={app.busyOp !== null}
          onUpdate={app.updateSettings}
          onReloadVersion={app.reloadVersion}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {app.createForm && (
        <CreateForm
          path={app.createForm.path}
          defaultSpace={SPACE_BY_DIR[app.createForm.path.split('/')[0]] ?? ''}
          busy={app.busyOp !== null}
          onSubmit={app.submitCreate}
          onClose={() => app.setCreateForm(null)}
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
              version — compare first if unsure.
            </p>
          )}
          <ul className="space-y-0.5 font-mono text-[11px]">
            {app.pullConfirm.paths.map(path => {
              const entry = app.entries.get(path)
              return (
                <li key={path} className="truncate">
                  {path}
                  {entry?.check && (
                    <span className="text-ink-faint"> v{entry.check.localVersion ?? '—'} → v{entry.check.remoteVersion ?? '—'}</span>
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
      <p>Page <span className="text-ink">{preview.pageId}</span> — currently v{preview.version}, push writes v{preview.version + 1}</p>
      <p>{preview.resolvedLinks ?? 0} relative link(s) resolve to Confluence URLs</p>
      {(preview.unresolvedLinks ?? 0) > 0 && (
        <p className="text-ahead">{preview.unresolvedLinks} link(s) cannot be resolved and stay as-is</p>
      )}
      <p className="pt-1 text-ink-faint">Dry run verified against the live remote version. The source file is never rewritten — links resolve at push time only.</p>
    </div>
  )
}
