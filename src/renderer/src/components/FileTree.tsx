import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

import type { SyncGroup } from '../../../shared/types.ts'
import { displayState, needsAttention, syncGroup, type FileEntry } from '../../../shared/status.ts'
import { buildTree, filesUnder, flattenVisible, orderPinnedFirst, pinnedGroupEnds, type TreeNode } from '../../../shared/tree.ts'
import { shortcutLabel, type SidebarMode } from '../commands.ts'
import { ChevronDownIcon, ChevronRightIcon, FolderIcon, PinIcon } from '../icons.tsx'
import { GROUP_META, STATE_META } from '../state-meta.ts'
import { StateGlyph } from './StateGlyph.tsx'

interface Props {
  entries: Map<string, FileEntry>
  counts: { files: number, attention: number }
  mode: SidebarMode
  selection: string | null
  /** Configured root folders - the only ones removable from the tree. */
  rootDirs: string[]
  pinnedDirs: string[]
  pinnedFiles: string[]
  onSetMode(mode: SidebarMode): void
  onSelect(path: string): void
  onOpenDiff(path: string): void
  onCheckFolder(path: string): void
  onTogglePin(path: string): void
  onSetPinned(path: string, pinned: boolean): void
  onOpenFolder(path: string): void
  onGetPage(path: string): void
  onRemoveFolder(path: string): void
  onSetIgnore(path: string, ignored: boolean): void
  onCopyPageId(pageId: string): void
  onCopyPath(path: string): void
}

interface ContextMenu {
  x: number
  y: number
  path: string
  kind: 'dir' | 'file'
}

const LEGEND: SyncGroup[] = ['synced', 'local', 'remote', 'conflict', 'unchecked']

export function FileTree(props: Props) {
  const { entries, selection, pinnedDirs, pinnedFiles, mode } = props
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<ContextMenu | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // While the context menu is open, Escape closes it (and nothing else).
  useEffect(() => {
    if (!menu) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setMenu(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [menu])

  // Changes mode narrows the same tree to the documents needing attention.
  const { rows, pinnedPaths, groupEnds } = useMemo(() => {
    const pins = [...pinnedDirs, ...pinnedFiles]
    const pinnedPaths = new Set(pins)
    const paths = [...entries.values()]
      .filter(entry => !entry.hidden && (mode === 'all' || needsAttention(displayState(entry))))
      .map(entry => entry.path)
    const rows = flattenVisible(orderPinnedFirst(buildTree(paths), pins), collapsed)
    return { rows, pinnedPaths, groupEnds: pinnedGroupEnds(rows, pinnedPaths) }
  }, [entries, collapsed, pinnedDirs, pinnedFiles, mode])

  const fileRows = useMemo(() => rows.filter(row => row.kind === 'file'), [rows])

  const toggleDir = (path: string): void => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter' && selection) {
      event.preventDefault()
      props.onOpenDiff(selection)
      return
    }
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && selection) {
      const dir = selection.slice(0, selection.lastIndexOf('/'))
      if (!dir) return
      event.preventDefault()
      setCollapsed(prev => {
        const next = new Set(prev)
        if (event.key === 'ArrowLeft') next.add(dir)
        else next.delete(dir)
        return next
      })
      return
    }
    const down = event.key === 'ArrowDown' || event.key === 'j'
    const up = event.key === 'ArrowUp' || event.key === 'k'
    if (!down && !up) return
    event.preventDefault()
    if (fileRows.length === 0) return
    const index = fileRows.findIndex(row => row.path === selection)
    const nextIndex = down ? Math.min(index + 1, fileRows.length - 1) : Math.max(index <= 0 ? 0 : index - 1, 0)
    const next = fileRows[nextIndex]
    props.onSelect(next.path)
    containerRef.current?.querySelector(`[data-path="${CSS.escape(next.path)}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-[11px] px-[14px] pb-3 pt-4">
        <div className="flex items-baseline gap-2">
          <span className="text-[12.5px] font-semibold tracking-[0.2px] text-ink">Documents</span>
          <span className="flex-1" />
          <span className="font-mono text-[12px] text-ink-label">{props.counts.files}</span>
        </div>
        <div className="flex gap-1.5">
          <ModeButton active={mode === 'changes'} title={`Changes - ${shortcutLabel('view.changes')}`} onClick={() => props.onSetMode('changes')}>
            {props.counts.attention > 0 && <span className="text-[11px] text-warn">⚠</span>}
            <span>Changes</span>
            {props.counts.attention > 0 && <span className="font-mono text-[11px] text-ink-body">{props.counts.attention}</span>}
          </ModeButton>
          <ModeButton active={mode === 'all'} title={`All documents - ${shortcutLabel('view.all')}`} onClick={() => props.onSetMode('all')}>All</ModeButton>
        </div>
      </div>
      <div className="mx-[14px] h-px bg-line-subtle" />

      {/* ponytail: no virtualization - a few hundred rows render fine; virtualise if the repo grows 10x. */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2 py-2.5 outline-none"
      >
        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-[12px] text-ink-label">
            {entries.size === 0 ? 'Scanning…' : mode === 'changes' ? 'Nothing needs attention' : 'No documents'}
          </p>
        )}
        {rows.map(row => (
          <Fragment key={row.path}>
          <Row
            node={row}
            entries={entries}
            selected={row.path === selection}
            pinned={pinnedPaths.has(row.path)}
            collapsed={collapsed.has(row.path)}
            subLabel={mode === 'changes' || collapsed.has(row.path)}
            onClick={() => (row.kind === 'dir' ? toggleDir(row.path) : props.onSelect(row.path))}
            onContextMenu={event => {
              event.preventDefault()
              setMenu({ x: event.clientX, y: event.clientY, path: row.path, kind: row.kind })
            }}
          />
          {groupEnds.has(row.path) && <div className="my-1 h-px shrink-0 bg-line-subtle" style={{ marginLeft: `${10 + row.depth * 17}px` }} />}
          </Fragment>
        ))}
      </div>

      <div className="flex flex-col gap-[7px] border-t border-line-subtle px-[14px] py-3">
        <span className="text-[10.5px] uppercase tracking-[0.09em] text-ink-label">States</span>
        <div className="flex flex-wrap gap-x-3.5 gap-y-2">
          {LEGEND.map(group => (
            <span key={group} className="flex items-center gap-1.5 text-[11px] text-ink-dim">
              <StateGlyph group={group} />{GROUP_META[group].label.replace(' changes', '')}
            </span>
          ))}
        </div>
      </div>

      {menu && (
        <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} onContextMenu={event => { event.preventDefault(); setMenu(null) }}>
          <div
            className="absolute w-52 overflow-hidden rounded-lg border border-line-menu bg-overlay py-1 shadow-menu"
            style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 190) }}
            onClick={event => event.stopPropagation()}
          >
            {menu.kind === 'dir'
              ? (
                  <>
                    <MenuItem
                      label={pinnedDirs.includes(menu.path) ? 'Unpin' : 'Pin on top'}
                      onClick={() => { props.onTogglePin(menu.path); setMenu(null) }}
                    />
                    <MenuItem label="Check this folder" onClick={() => { props.onCheckFolder(menu.path); setMenu(null) }} />
                    <MenuItem label="Get page from Confluence…" onClick={() => { props.onGetPage(menu.path); setMenu(null) }} />
                    <MenuItem label="Open folder" onClick={() => { props.onOpenFolder(menu.path); setMenu(null) }} />
                    {props.rootDirs.includes(menu.path) && (
                      <>
                        <div className="mx-2 my-1 h-px bg-line" />
                        <MenuItem label="Remove from tree" danger onClick={() => { props.onRemoveFolder(menu.path); setMenu(null) }} />
                      </>
                    )}
                  </>
                )
              : (() => {
                  const entry = entries.get(menu.path)
                  const pageId = entry?.check?.pageId ?? entry?.pageId
                  return (
                    <>
                      <MenuItem label={pinnedFiles.includes(menu.path) ? 'Unpin from top' : 'Pin on top'} onClick={() => { props.onSetPinned(menu.path, !pinnedFiles.includes(menu.path)); setMenu(null) }} />
                      <MenuItem
                        label={entry?.ignored ? 'Include this document' : 'Ignore this document'}
                        onClick={() => { props.onSetIgnore(menu.path, !entry?.ignored); setMenu(null) }}
                      />
                      <div className="mx-2 my-1 h-px bg-line" />
                      {pageId && <MenuItem label="Copy page ID" onClick={() => { props.onCopyPageId(pageId); setMenu(null) }} />}
                      <MenuItem label="Copy document path" onClick={() => { props.onCopyPath(menu.path); setMenu(null) }} />
                    </>
                  )
                })()}
          </div>
        </div>
      )}
    </div>
  )
}

function ModeButton({ active, title, onClick, children }: { active: boolean, title: string, onClick(): void, children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex items-center gap-[7px] whitespace-nowrap rounded-md px-3 py-[5px] text-[12px] ${
        active ? 'bg-selected font-medium text-ink' : 'text-ink-dim hover:bg-row-hover hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function MenuItem({ label, onClick, danger }: { label: string, onClick(): void, danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left text-[12.5px] ${danger ? 'text-conflict hover:bg-danger' : 'text-ink-body hover:bg-row-hover'}`}
    >
      {label}
    </button>
  )
}

/** Collapsed folder sub-label: what needs attention, else what is not checked. */
function rollup(node: TreeNode, entries: Map<string, FileEntry>): string | null {
  let attention = 0
  let unchecked = 0
  for (const path of filesUnder(node)) {
    const entry = entries.get(path)
    const state = entry ? displayState(entry) : 'unchecked'
    if (needsAttention(state)) attention += 1
    else if (syncGroup(state) === 'unchecked') unchecked += 1
  }
  if (attention > 0) return `${attention} need${attention === 1 ? 's' : ''} attention`
  if (unchecked > 0) return `${unchecked} not checked`
  return null
}

interface RowProps {
  node: TreeNode
  entries: Map<string, FileEntry>
  selected: boolean
  pinned: boolean
  collapsed: boolean
  /** Folder rows spell out what they hold - always in Changes mode, when collapsed in All. */
  subLabel: boolean
  onClick(): void
  onContextMenu?(event: React.MouseEvent): void
}

function Row({ node, entries, selected, pinned, collapsed, subLabel, onClick, onContextMenu }: RowProps) {
  const indent = { paddingLeft: `${10 + node.depth * 17}px` }

  if (node.kind === 'dir') {
    const sub = subLabel ? rollup(node, entries) : null
    return (
      <button
        onClick={onClick}
        onContextMenu={onContextMenu}
        style={indent}
        className={`flex w-full shrink-0 items-center gap-[7px] rounded-md pr-2.5 text-left hover:bg-row-hover ${sub ? 'py-[6px]' : 'h-[30px]'}`}
      >
        <span className="flex w-2.5 shrink-0 justify-center text-ink-label">{collapsed ? <ChevronRightIcon size={10} /> : <ChevronDownIcon size={10} />}</span>
        <FolderIcon size={14} className="shrink-0 text-ink-label" />
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className={`truncate text-[12.5px] ${node.depth === 0 ? 'font-medium text-ink' : 'text-ink-body'}`}>
            {node.name}{pinned && <PinIcon size={11} className="ml-1.5 inline text-brand" aria-label="Pinned on top" />}
          </span>
          {sub && <span className={`text-[11px] ${sub.includes('attention') ? 'text-warn' : 'text-ink-label'}`}>{sub}</span>}
        </span>
        <span className="font-mono text-[11px] text-ink-label">{filesUnder(node).length}</span>
      </button>
    )
  }

  const entry = entries.get(node.path)
  const state = entry ? displayState(entry) : 'unchecked'
  const meta = STATE_META[state]
  return (
    <button
      data-path={node.path}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={`${node.path} - ${meta.label.toLowerCase()}${meta.hint ? `: ${meta.hint}` : ''}`}
      style={indent}
      className={`flex h-[30px] w-full shrink-0 items-center gap-[9px] rounded-md pr-2.5 text-left ${
        selected ? 'bg-selected shadow-[inset_2px_0_0_var(--color-select-edge)]' : 'hover:bg-row-hover'
      }`}
    >
      <StateGlyph group={syncGroup(state)} className="text-[9px]" />
      <span className={`min-w-0 flex-1 truncate text-[12.5px] ${selected ? 'font-medium text-ink' : entry?.tracked ? 'text-ink-dim' : 'text-ink-label'}`}>
        {entry?.title ?? node.name}
      </span>
      {pinned && (
        <span title="Pinned on top" className="shrink-0 text-brand">
          <PinIcon size={11} />
        </span>
      )}
    </button>
  )
}
