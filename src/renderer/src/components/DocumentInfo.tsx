import { cliStatus } from '../../../shared/cli-status.ts'
import type { FileEntry } from '../../../shared/status.ts'
import type { VdocLogEntry } from '../../../shared/types.ts'
import { shellCommand } from '../../../shared/shell-command.ts'
import { command, shortcutLabel, type CommandContext } from '../commands.ts'
import { ExternalIcon } from '../icons.tsx'
import { OutcomeIcon } from './StateGlyph.tsx'
import type { SyncEvent } from '../useApp.ts'

interface Props {
  ctx: CommandContext
  entry: FileEntry
  labels: string[]
  lastSync: SyncEvent | undefined
  /** Most recent CLI command that named this document. */
  lastCli: VdocLogEntry | undefined
  onOpenLogs(): void
}

const ACTIONS = ['file.editor', 'file.finder', 'file.copyUrl', 'file.copyPath']

const stamp = (at: number): string => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Where the header's tertiary technical data went - toggled with ⌘I. */
export function DocumentInfo({ ctx, entry, labels, lastSync, lastCli, onOpenLogs }: Props) {
  const check = entry.check
  const pageId = check?.pageId ?? entry.pageId
  const status = lastCli ? cliStatus(lastCli) : null
  return (
    <aside className="flex w-[286px] shrink-0 flex-col gap-[18px] overflow-y-auto border-l border-line-subtle bg-sidebar px-[18px] py-[18px]">
      <span className="text-[11px] uppercase tracking-[0.09em] text-ink-label">Document info</span>

      <dl className="flex flex-col gap-[11px] text-[11.5px]">
        <Row label="Confluence">
          {pageId
            ? <button onClick={() => command('file.browser').run(ctx)} className="inline-flex items-center gap-1 font-mono text-link hover:text-link-hover hover:underline">{pageId}<ExternalIcon size={11} /></button>
            : <span className="text-ink-label">no page linked</span>}
        </Row>
        <Row label="Local version"><Mono value={check?.localVersion} /></Row>
        <Row label="Remote version"><Mono value={check?.remoteVersion} /></Row>
        <Row label="Last sync">
          {lastSync ? <span className="text-ink-body">{lastSync.op} · {stamp(lastSync.at)}</span> : <span className="text-ink-label">not this session</span>}
        </Row>
        {labels.length > 0 && (
          <Row label="Labels">
            <span className="flex flex-wrap gap-1">
              {labels.map(label => (
                <span key={label} className="rounded-full border border-control bg-raised px-2 py-px text-[10.5px] text-ink-dim">{label}</span>
              ))}
            </span>
          </Row>
        )}
      </dl>

      <div className="h-px bg-line-subtle" />

      <div className="flex flex-col gap-2">
        <span className="text-[11px] uppercase tracking-[0.09em] text-ink-label">Last CLI result</span>
        {lastCli && status
          ? (
              <div className="flex items-center gap-[9px] rounded-md border border-line-subtle bg-raised-row px-2.5 py-[9px]">
                <OutcomeIcon outcome={status.outcome} />
                <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="truncate font-mono text-[11px] text-ink-body">{shellCommand(['vdoc', ...lastCli.args], window.vdoc.platform === 'win32' ? 'powershell' : 'posix')}</span>
                  <span className="truncate text-[10.5px] text-ink-label">
                    {status.summary.replace(/^\w+ - /, '')} · {(lastCli.durationMs / 1000).toFixed(2)} s · {new Date(lastCli.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            )
          : <span className="text-[11.5px] text-ink-label">no command ran on this document yet</span>}
        <button onClick={onOpenLogs} className="self-start text-[11.5px] text-accent hover:underline">
          Open in CLI logs <span className="font-mono text-ink-label">{shortcutLabel('app.logs')}</span>
        </button>
      </div>

      <div className="h-px bg-line-subtle" />

      <div className="flex flex-col gap-1">
        {ACTIONS.map(id => {
          const cmd = command(id)
          const reason = cmd.reason?.(ctx)
          return (
            <button
              key={id}
              disabled={reason !== undefined}
              title={reason}
              onClick={() => cmd.run(ctx)}
              className="rounded px-2 py-[6px] text-left text-[12px] text-ink-body hover:bg-row-hover hover:text-ink disabled:text-ink-label disabled:hover:bg-transparent"
            >
              {cmd.label}
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function Row({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <dt className="w-[92px] shrink-0 text-ink-label">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink-body">{children}</dd>
    </div>
  )
}

function Mono({ value }: { value: number | undefined }) {
  return value === undefined ? <span className="text-ink-label">-</span> : <span className="font-mono">{value}</span>
}
