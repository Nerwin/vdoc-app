import { useMemo, useState } from 'react'

import { cliStatus } from '../../../shared/cli-status.ts'
import { frontmatterEntries, type FrontmatterEntry } from '../../../shared/frontmatter.ts'
import type { FileEntry } from '../../../shared/status.ts'
import type { VdocLogEntry } from '../../../shared/types.ts'
import { shellCommand } from '../../../shared/shell-command.ts'
import { command, isPinned, shortcutLabel, type CommandContext } from '../commands.ts'
import { timeAgo } from '../../../shared/time.ts'
import { ChevronDownIcon, ChevronRightIcon, ExternalIcon, PinIcon } from '../icons.tsx'
import type { OutlineItem } from './PreviewView.tsx'
import { OutcomeIcon } from './StateGlyph.tsx'

type SectionId = 'outline' | 'info'
type OpenSections = Record<SectionId, boolean>

const WIDTH_MIN = 260
const WIDTH_MAX = 420
const clampWidth = (width: number): number => Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, width))

/** Keys the header and the Sync section already show. */
const SHOWN_ELSEWHERE = new Set(['title', 'confluencePageId', 'confluencePageVersion', 'confluenceSpace'])

interface Props {
  ctx: CommandContext
  entry: FileEntry
  /** The file text as loaded in the pane - frontmatter is read from it. */
  content: string | null
  space: string | undefined
  labels: string[]
  /** Epoch ms when local and Confluence last matched, when known. */
  lastSync: number | undefined
  /** Most recent CLI command that named this document. */
  lastCli: VdocLogEntry | undefined
  outline: OutlineItem[]
  activeSection: string | null
  onJump(id: string): void
  onOpenLogs(): void
}

const parentOf = (path: string): string => path.slice(0, path.lastIndexOf('/') + 1)

/** `top of ADR` for the first pin in its folder, `#2 in ADR` after that. */
function pinPosition(path: string, pinned: string[]): string {
  const rank = pinned.filter(entry => parentOf(entry) === parentOf(path)).indexOf(path) + 1
  const folder = path.split('/').at(-2) ?? 'the tree'
  return rank <= 1 ? `top of ${folder}` : `#${rank} in ${folder}`
}

const stamp = (at: number): string => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function loadSections(root: string): OpenSections {
  try {
    const saved = JSON.parse(localStorage.getItem(`inspectorSections:${root}`) ?? '{}') as Partial<OpenSections>
    return { outline: saved.outline !== false, info: saved.info !== false }
  } catch {
    return { outline: true, info: true }
  }
}

/**
 * The inspector: Outline and Info as collapsible sections, no close control - only the
 * top-bar toggle and ⌘I open or close it. Open sections and width persist per workspace.
 */
export function DocumentInfo(props: Props) {
  const { ctx, entry, content } = props
  const root = ctx.app.root
  const [open, setOpen] = useState<OpenSections>(() => loadSections(root))
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(`inspectorWidth:${root}`))
    return saved >= WIDTH_MIN && saved <= WIDTH_MAX ? saved : 300
  })
  const toggle = (id: SectionId): void => {
    const next = { ...open, [id]: !open[id] }
    localStorage.setItem(`inspectorSections:${root}`, JSON.stringify(next))
    setOpen(next)
  }

  const startResize = (event: React.MouseEvent): void => {
    event.preventDefault()
    const startX = event.clientX
    const widthAt = (clientX: number): number => clampWidth(width - (clientX - startX))
    const onMove = (move: MouseEvent): void => setWidth(widthAt(move.clientX))
    const onUp = (up: MouseEvent): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      localStorage.setItem(`inspectorWidth:${root}`, String(widthAt(up.clientX)))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const ignored = Boolean(entry.ignored)
  // An ignored file shows no Confluence data anywhere - its confluence* keys included.
  const frontmatter = useMemo(
    () => (content === null ? [] : frontmatterEntries(content))
      .filter(field => !SHOWN_ELSEWHERE.has(field.key))
      .filter(field => !ignored || !field.key.startsWith('confluence') || field.key === 'confluenceIgnore'),
    [content, ignored],
  )

  // Outline takes its natural height, capped so an open Info section always keeps room.
  const outlineFlex = !open.outline ? 'shrink-0' : open.info ? 'max-h-[60%] min-h-0 shrink' : 'min-h-0 flex-1'

  return (
    <aside style={{ width }} className="relative flex shrink-0 flex-col border-l border-line bg-sidebar">
      <div onMouseDown={startResize} className="absolute inset-y-0 -left-0.5 z-10 w-1 cursor-col-resize" />
      <div className={`flex flex-col ${outlineFlex}`}>
        <SectionHeader label="Outline" open={open.outline} onToggle={() => toggle('outline')} />
        {open.outline && (
          <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto px-[14px] pb-3">
            {props.outline.length === 0
              ? <span className="px-2 py-1 text-[11.5px] text-ink-label">No sections</span>
              : props.outline.map(item => (
                  <button
                    key={item.id}
                    onClick={() => props.onJump(item.id)}
                    className={`shrink-0 rounded-[5px] px-2.5 py-1.5 text-left text-[12.5px] leading-[1.45] ${
                      item.id === props.activeSection
                        ? 'bg-selected font-medium text-ink shadow-[inset_2px_0_0_var(--color-select-edge)]'
                        : 'text-ink-dim hover:bg-row-hover hover:text-ink'
                    }`}
                  >
                    {item.text}
                  </button>
                ))}
          </div>
        )}
      </div>
      <div className={`flex flex-col border-t border-line-subtle ${open.info ? 'min-h-0 flex-1' : 'shrink-0'}`}>
        <SectionHeader label="Info" open={open.info} onToggle={() => toggle('info')} />
        {open.info && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <FrontmatterSection entries={frontmatter} />
            {!ignored && (
              <>
                <Rule />
                <Section label="Sync">
                  <ConfluenceRow ctx={ctx} entry={entry} />
                  <Row label="Space"><Value text={props.space} /></Row>
                  <Row label="Local version"><Value text={entry.check?.localVersion} mono /></Row>
                  <Row label="Remote version"><Value text={entry.check?.remoteVersion} mono /></Row>
                  <Row label="Last sync"><Value text={props.lastSync && stamp(props.lastSync)} fallback="unknown" /></Row>
                  <Row label="Last check"><Value text={entry.checkedAt && timeAgo(entry.checkedAt)} fallback="never" /></Row>
                  {props.labels.length > 0 && (
                    <Row label="Labels">
                      <span className="flex flex-wrap gap-1">{props.labels.map(label => <Chip key={label} text={label} />)}</span>
                    </Row>
                  )}
                  <LastCliCard lastCli={props.lastCli} />
                  <button onClick={props.onOpenLogs} className="self-start px-2 text-[11.5px] text-link hover:text-link-hover">
                    Open in CLI logs <span className="font-mono text-ink-label">{shortcutLabel('app.logs')}</span>
                  </button>
                </Section>
              </>
            )}
            {isPinned(ctx) && (
              <>
                <Rule />
                <Section label="App">
                  <div className="flex items-center gap-2.5 px-2">
                    <span className="w-[88px] shrink-0 text-[11.5px] text-ink-mute">Pinned</span>
                    <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-ink-body">
                      <PinIcon size={11} className="shrink-0 text-brand" />
                      <span className="truncate">{pinPosition(entry.path, ctx.app.pinnedFiles)}</span>
                    </span>
                    <div className="flex-1" />
                    <button onClick={() => command('file.pin').run(ctx)} className="shrink-0 text-[11px] text-link hover:text-link-hover">Unpin</button>
                  </div>
                </Section>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}

function SectionHeader({ label, open, onToggle }: { label: string, open: boolean, onToggle(): void }) {
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      className="flex h-[34px] shrink-0 items-center gap-1.5 px-3 text-left text-[11px] font-semibold uppercase tracking-[0.9px] text-ink-dim hover:text-ink"
    >
      <Chevron size={12} className="shrink-0 text-ink-mute" />
      {label}
    </button>
  )
}

function Label({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return <span className={`px-2 text-[10.5px] uppercase tracking-[1px] text-ink-label ${className}`}>{children}</span>
}

function Rule() {
  return <div className="mx-[14px] my-1 h-px bg-line-subtle" />
}

function Section({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 p-[14px]">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2.5 px-2">
      <span className="w-[88px] shrink-0 truncate text-[11.5px] text-ink-mute" title={label}>{label}</span>
      <div className="min-w-0 flex-1 text-[11.5px] text-ink-body">{children}</div>
    </div>
  )
}

function Value({ text, mono, fallback = '-' }: { text: string | number | undefined, mono?: boolean, fallback?: string }) {
  return text === undefined || text === ''
    ? <span className="text-ink-label">{fallback}</span>
    : <span className={mono ? 'font-mono' : ''}>{text}</span>
}

function Chip({ text }: { text: string }) {
  return <span className="rounded-[3px] border border-line bg-row-hover px-1.5 py-px font-mono text-[10.5px] text-ink-dim">{text}</span>
}

const BADGE: Record<string, string> = {
  DONE: 'border-badge-done-edge bg-badge-done-bg text-badge-done-ink',
  ACTIVE: 'border-badge-active-edge bg-badge-active-bg text-badge-active-ink',
}

const DATE = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+Z?)?$/

function FrontmatterValue({ field }: { field: FrontmatterEntry }) {
  const { key, value } = field
  if (Array.isArray(value)) return <span className="flex flex-wrap gap-1">{value.map(item => <Chip key={item} text={item} />)}</span>
  if (key === 'status') {
    return (
      <span className={`rounded border px-[7px] py-px font-mono text-[11px] font-semibold ${BADGE[value.toUpperCase()] ?? 'border-badge-todo-edge bg-badge-todo-bg text-badge-todo-ink'}`}>
        {value}
      </span>
    )
  }
  if (DATE.test(value)) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return <span>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
  }
  if (value === 'true' || value === 'false') return <span className="font-mono text-ink">{value}</span>
  return <span className="break-words font-mono">{value}</span>
}

function FrontmatterSection({ entries }: { entries: FrontmatterEntry[] }) {
  return (
    <Section label="Frontmatter">
      {entries.length === 0
        ? <span className="px-2 text-[11.5px] text-ink-label">No frontmatter</span>
        : entries.map(field => (
            <Row key={field.key} label={field.key}><FrontmatterValue field={field} /></Row>
          ))}
    </Section>
  )
}

function ConfluenceRow({ ctx, entry }: { ctx: CommandContext, entry: FileEntry }) {
  const pageId = entry.check?.pageId ?? entry.pageId
  return (
    <Row label="Confluence">
      {pageId
        ? (
            <button onClick={() => command('file.browser').run(ctx)} className="inline-flex items-center gap-[5px] font-mono text-link hover:text-link-hover">
              {pageId}<ExternalIcon size={11} className="shrink-0" />
            </button>
          )
        : <span className="text-ink-label">no page linked</span>}
    </Row>
  )
}

function LastCliCard({ lastCli }: { lastCli: VdocLogEntry | undefined }) {
  if (!lastCli) return <span className="px-2 text-[11.5px] text-ink-label">no command ran on this document yet</span>
  const status = cliStatus(lastCli)
  return (
    <div className="mx-2 mt-1 flex items-center gap-[9px] rounded-md border border-line bg-row-hover px-2.5 py-[9px]">
      <OutcomeIcon outcome={status.outcome} size={11} />
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate font-mono text-[11px] text-ink-body">{shellCommand(['vdoc', ...lastCli.args], window.vdoc.platform === 'win32' ? 'powershell' : 'posix')}</span>
        <span className="truncate text-[10.5px] text-ink-mute">
          {status.summary.replace(/^\w+ - /, '')} · {(lastCli.durationMs / 1000).toFixed(2)} s · {new Date(lastCli.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}
