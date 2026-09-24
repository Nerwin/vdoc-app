import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

import type { SyncGroup } from '../../../shared/types.ts'
import { displayState, needsAttention, syncGroup, type FileEntry } from '../../../shared/status.ts'
import { buildTree, filesUnder, flattenVisible, orderPinnedFirst, pinnedGroupEnds, type TreeNode } from '../../../shared/tree.ts'
import { shortcutLabel, type SidebarMode } from '../commands.ts'
import { BanIcon, ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, FolderIcon, PinIcon } from '../icons.tsx'
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
  legendOpen: boolean
  onToggleLegend(): void
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
  onOpenEditor(path: string): void
  onReveal(path: string): void
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
          <span className="font-mono text-[12px] text-ink-mute">{props.counts.files}</span>
        </div>
        <div className="flex gap-1.5">
          <ModeButton active={mode === 'changes'} title={`Changes - ${shortcutLabel('view.changes')}`} onClick={() => props.onSetMode('changes')}>
            {props.counts.attention > 0 && <span className="text-[11px] text-warn">⚠</span>}
            <span>Changes</span>
            {props.counts.attention > 0 && <span className={`font-mono text-[11px] ${mode === 'changes' ? 'text-ink-body' : 'text-warn'}`}>{props.counts.attention}</span>}
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
            subLabel={mode === 'changes'}
            onClick={() => (row.kind === 'dir' ? toggleDir(row.path) : props.onSelect(row.path))}
            onContextMenu={event => {
              event.preventDefault()
              setMenu({ x: event.clientX, y: event.clientY, path: row.path, kind: row.kind })
            }}
          />
          {groupEnds.has(row.path) && <div className="my-1 mr-2.5 h-px shrink-0 bg-line-subtle" style={{ marginLeft: indentOf(row.depth) }} />}
          </Fragment>
        ))}
      </div>

      <div className={`relative shrink-0 border-t border-line-subtle ${props.legendOpen ? 'flex flex-col gap-2 px-[14px] pb-3 pt-[14px]' : 'h-3'}`}>
        <button
          title={props.legendOpen ? 'Collapse legend' : 'Show legend'}
          aria-expanded={props.legendOpen}
          onClick={props.onToggleLegend}
          className="absolute left-1/2 top-[-9px] flex h-[17px] w-[30px] -translate-x-1/2 items-center justify-center rounded-full border border-line bg-sidebar text-ink-mute hover:border-sep hover:bg-raised hover:text-ink"
        >
          {props.legendOpen ? <ChevronDownIcon size={12} strokeWidth={2.2} /> : <ChevronUpIcon size={12} strokeWidth={2.2} />}
        </button>
        {props.legendOpen && (
          <>
            <span className="text-[10.5px] tracking-[1px] text-ink-label">STATES</span>
            <div className="flex flex-wrap gap-x-3.5 gap-y-2">
              {LEGEND.map(group => (
                <span key={group} className="flex items-center gap-1.5 text-[11px] text-ink-dim">
                  <StateGlyph group={group} />{GROUP_META[group].label.replace(' changes', '')}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {menu && (
        <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} onContextMenu={event => { event.preventDefault(); setMenu(null) }}>
          <div
            className="absolute flex w-[280px] flex-col gap-0.5 rounded-[7px] border border-line bg-chrome px-1.5 pb-0.5 pt-1 shadow-menu"
            style={{ left: Math.min(menu.x, window.innerWidth - 288), top: Math.min(menu.y, window.innerHeight - 240) }}
            onClick={event => event.stopPropagation()}
          >
            {menu.kind === 'dir'
              ? (
                  <>
                    <MenuItem
                      icon={<PinIcon size={11} className="text-brand" />}
                      label={pinnedDirs.includes(menu.path) ? 'Unpin from top' : 'Pin on top'}
                      onClick={() => { props.onTogglePin(menu.path); setMenu(null) }}
                    />
                    <MenuItem label="Check this folder" onClick={() => { props.onCheckFolder(menu.path); setMenu(null) }} />
                    <MenuItem label="Get page from Confluence…" onClick={() => { props.onGetPage(menu.path); setMenu(null) }} />
                    <MenuItem label="Open folder" onClick={() => { props.onOpenFolder(menu.path); setMenu(null) }} />
                    {props.rootDirs.includes(menu.path) && (
                      <>
                        <MenuRule />
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
                      <MenuItem label="Open in editor" onClick={() => { props.onOpenEditor(menu.path); setMenu(null) }} />
                      <MenuItem label="Show in folder" onClick={() => { props.onReveal(menu.path); setMenu(null) }} />
                      <MenuRule />
                      <MenuItem
                        icon={<PinIcon size={11} className="text-brand" />}
                        label={pinnedFiles.includes(menu.path) ? 'Unpin from top' : 'Pin on top'}
                        onClick={() => { props.onSetPinned(menu.path, !pinnedFiles.includes(menu.path)); setMenu(null) }}
                      />
                      <MenuItem
                        icon={<BanIcon size={13} className="text-ink-mute" />}
                        label={entry?.ignored ? 'Include in Confluence' : 'Ignore in Confluence'}
                        hint="edits frontmatter"
                        onClick={() => { props.onSetIgnore(menu.path, !entry?.ignored); setMenu(null) }}
                      />
                      <MenuRule />
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
        active ? 'bg-hover font-medium text-ink' : 'text-ink-dim hover:bg-row-hover hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

interface MenuItemProps {
  label: string
  onClick(): void
  icon?: React.ReactNode
  hint?: string
  danger?: boolean
}

function MenuItem({ label, onClick, icon, hint, danger }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-[9px] whitespace-nowrap rounded-[5px] px-2.5 py-1.5 text-left text-[12px] ${danger ? 'text-conflict hover:bg-danger' : 'text-ink-body hover:bg-hover'}`}
    >
      {icon && <span className="flex shrink-0">{icon}</span>}
      {label}
      {hint && <span className="ml-auto text-[10.5px] text-ink-label">{hint}</span>}
    </button>
  )
}

const MenuRule = () => <div className="mx-1.5 my-[3px] h-px bg-line" />

const indentOf = (depth: number): string => `${10 + depth * 16}px`

/** Changes-mode folder sub-label: the attention count, else what is not checked. */
function rollup(node: TreeNode, entries: Map<string, FileEntry>): string | null {
  let attention = 0
  let unchecked = 0
  for (const path of filesUnder(node)) {
    const entry = entries.get(path)
    const state = entry ? displayState(entry) : 'unchecked'
    if (needsAttention(state)) attention += 1
    else if (syncGroup(state) === 'unchecked') unchecked += 1
  }
  if (attention > 0) return `${attention} attention`
  if (unchecked > 0) return `${unchecked} not checked`
  return null
}

interface RowProps {
  node: TreeNode
  entries: Map<string, FileEntry>
  selected: boolean
  pinned: boolean
  collapsed: boolean
  /** Folder rows spell out what they hold - Changes mode only. */
  subLabel: boolean
  onClick(): void
  onContextMenu?(event: React.MouseEvent): void
}

function Row({ node, entries, selected, pinned, collapsed, subLabel, onClick, onContextMenu }: RowProps) {
  const indent = { paddingLeft: indentOf(node.depth) }

  if (node.kind === 'dir') {
    const sub = subLabel ? rollup(node, entries) : null
    return (
      <button
        onClick={onClick}
        onContextMenu={onContextMenu}
        style={indent}
        className={`flex w-full shrink-0 items-center gap-2 rounded-md pr-2.5 text-left hover:bg-row-hover ${sub ? 'min-h-[44px] py-1.5' : 'h-[30px]'}`}
      >
        <span className="flex w-2.5 shrink-0 justify-center text-ink-label">{collapsed ? <ChevronRightIcon size={10} /> : <ChevronDownIcon size={10} />}</span>
        <FolderIcon size={14} className={`shrink-0 ${node.depth === 0 ? 'text-brand' : 'text-ink-dim'}`} />
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className={`truncate text-[12.5px] ${node.depth === 0 ? 'font-medium text-ink' : 'text-ink-body'}`}>{node.name}</span>
          {sub && <span className={`text-[11px] ${sub.includes('attention') ? 'text-warn' : 'text-ink-mute'}`}>{sub}</span>}
        </span>
        {pinned && <PinIcon size={11} className="shrink-0 text-brand" aria-label="Pinned on top" />}
        <span className="font-mono text-[11px] text-ink-mute">{filesUnder(node).length}</span>
      </button>
    )
  }

  const entry = entries.get(node.path)
  const state = entry ? displayState(entry) : 'unchecked'
  const group = syncGroup(state)
  const meta = STATE_META[state]
  const quiet = group === 'unchecked' || group === 'unlinked' || group === 'ignored'
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
      <StateGlyph group={group} className={`w-2.5 shrink-0 justify-center ${group === 'synced' || quiet ? 'text-[9px]' : 'text-[10px]'}`} />
      <span className={`min-w-0 flex-1 truncate text-[12.5px] ${selected ? 'font-medium text-ink' : quiet ? 'text-ink-dim' : 'text-ink-body'}`}>
        {entry?.title ?? node.name}
      </span>
      {entry?.ignored && (
        <span title="confluenceIgnore: true - never synced" className="flex shrink-0 text-ink-label">
          <BanIcon size={10} />
        </span>
      )}
      {pinned && (
        <span title="Pinned on top" className="flex shrink-0 text-brand">
          <PinIcon size={11} />
        </span>
      )}
    </button>
  )
}
