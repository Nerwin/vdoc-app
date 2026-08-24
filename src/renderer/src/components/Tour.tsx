import { useEffect, useState, type ReactNode } from 'react'

import type { DisplayState } from '../../../shared/types.ts'
import { STATE_META } from '../state-meta.ts'
import { command, keycaps, type CommandContext } from '../commands.ts'
import { ModalButton } from './Modal.tsx'

/**
 * Guided welcome tour: a centered setup check on the first step, then a floating
 * card that spotlights real UI regions while the app stays fully usable.
 * Auto-opens on first launch; relaunch via the palette (App: Welcome tour).
 */

function Keys({ id }: { id: string }) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-[3px] align-middle">
      {keycaps(command(id).keys).map((cap, index) => (
        <kbd
          key={index}
          className="min-w-[18px] rounded border border-keycap-edge bg-keycap-bg px-[5px] py-px text-center text-[11px] font-normal text-keycap-ink"
        >
          {cap}
        </kbd>
      ))}
    </span>
  )
}

function Chip({ state }: { state: DisplayState }) {
  return (
    <span className={`mr-1 inline-block rounded-full border px-2 py-px text-[11px] ${STATE_META[state].chip}`}>
      {STATE_META[state].label}
    </span>
  )
}

/** Runs a registry command from a step - greyed out with its reason when unavailable. */
function TryButton({ id, label, ctx }: { id: string, label: string, ctx: CommandContext }) {
  const cmd = command(id)
  const reason = cmd.reason?.(ctx)
  return (
    <span className="flex items-center gap-2 pt-1">
      <ModalButton label={label} disabled={reason !== undefined} onClick={() => cmd.run(ctx)} />
      {reason && <span className="text-[11px] text-ink-faint">{reason}</span>}
    </span>
  )
}

function CheckRow({ ok, label, detail }: { ok: boolean | null, label: string, detail: string }) {
  const tone = ok === null ? 'text-ink-faint' : ok ? 'text-sync' : 'text-warn'
  return (
    <div className="flex items-baseline gap-2">
      <span className={`w-3 shrink-0 text-center ${tone}`}>{ok === null ? '…' : ok ? '✓' : '✗'}</span>
      <span className="w-32 shrink-0 text-ink">{label}</span>
      <span className="min-w-0 break-words text-ink-dim">{detail}</span>
    </div>
  )
}

/** Live setup checklist - reads the store, so it refreshes as Settings fixes things. */
function SetupChecks({ ctx }: { ctx: CommandContext }) {
  const { settings, auth, entries } = ctx.app
  const files = entries.size
  return (
    <div className="space-y-1.5 rounded-lg border border-line-subtle bg-content p-3">
      <CheckRow
        ok={settings ? settings.version !== null : null}
        label="vdoc CLI"
        detail={settings
          ? settings.version ?? `cannot run ${settings.resolvedBin} - set the binary path in Settings`
          : 'probing…'}
      />
      <CheckRow
        ok={settings ? files > 0 : null}
        label="Docs repository"
        detail={settings
          ? files > 0
            ? `${settings.resolvedRoot} - ${files} Markdown file(s)`
            : `no Markdown files under ${settings.resolvedRoot} - check the docs root and folders in Settings`
          : 'scanning…'}
      />
      <CheckRow
        ok={auth ? auth.ok : null}
        label="Confluence"
        detail={auth
          ? auth.ok
            ? `connected as ${auth.displayName ?? auth.email ?? 'unknown'} (${auth.method})`
            : auth.error ?? 'not connected - add credentials in Settings'
          : 'checking…'}
      />
    </div>
  )
}

function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-ink">{children}</strong>
}

interface Step {
  title: string
  /** data-tour anchor to spotlight while this step is shown. */
  target?: string
  body(ctx: CommandContext): ReactNode
}

const STEPS: Step[] = [
  {
    title: 'Welcome to V-DOC',
    body: ctx => (
      <>
        <p>
          V-DOC keeps this Markdown repository and Confluence in sync - every change is previewed
          first, and nothing is ever overwritten without asking. Quick health check:
        </p>
        <SetupChecks ctx={ctx} />
        <p>Anything marked ✗ is fixed in Settings - this list updates live.</p>
        <TryButton id="app.settings" label="Open Settings…" ctx={ctx} />
      </>
    ),
  },
  {
    title: 'The file tree',
    target: 'tree',
    body: ctx => (
      <>
        <p>
          Every Markdown file under your configured folders, each with its live sync state - for
          example <Chip state="in-sync" /><Chip state="behind" /><Chip state="unverified" />.
        </p>
        <p>
          <Keys id="view.filterField" /> filters by name, <Keys id="file.goto" /> jumps to any
          file, and the coloured counters in the status bar filter by state. Right-click a folder
          to pin it, check only it, or open it.
        </p>
        <TryButton id="file.goto" label="Try it - go to a file…" ctx={ctx} />
      </>
    ),
  },
  {
    title: 'Check · Pull · Push · Verify',
    target: 'topbar',
    body: ctx => (
      <>
        <p>
          <Strong>Check</Strong> (<Keys id="sync.check" />, all files <Keys id="sync.checkAll" />)
          is read-only: has Confluence moved? <Strong>Pull</Strong> refreshes local files that are
          behind. <Strong>Push</Strong> publishes local changes - always after a dry-run preview.
          {' '}<Strong>Verify</Strong> compares actual content and records the baseline that makes
          local-edit detection possible.
        </p>
        <p>
          Files with local edits are never overwritten silently, and anything destructive
          (force push, force pull) needs an explicit red confirmation.
        </p>
        <TryButton id="sync.checkAll" label="Check all files now" ctx={ctx} />
      </>
    ),
  },
  {
    title: 'The dashboard',
    target: 'main',
    body: ctx => (
      <>
        <p>
          With no file selected, the main pane is the dashboard: everything needing attention
          (and who last changed it on Confluence), bulk actions like Verify all, quick actions,
          and your recent files.
        </p>
        <p>Esc returns there from any file.</p>
        <TryButton id="view.dashboard" label="Show the dashboard" ctx={ctx} />
      </>
    ),
  },
  {
    title: 'Reading & editing',
    target: 'main',
    body: () => (
      <>
        <p>
          Selecting a file opens it in <Strong>Preview</Strong>. The tabs
          - <Keys id="view.content" /> … <Keys id="view.comments" /> - switch between Content
          (an editor that auto-saves as you type), Preview, Split, Diff against the live page,
          and Comments.
        </p>
        <p>
          Links to other local docs navigate in-app (<Keys id="file.back" /> goes back), and the
          backlinks button in the tab row lists every doc linking to the open one.
        </p>
      </>
    ),
  },
  {
    title: 'Everything is a command',
    target: 'statusbar',
    body: ctx => (
      <>
        <p>
          The palette <Keys id="app.palette" /> holds every action with its shortcut - a greyed-out
          command tells you why it is unavailable. <Keys id="app.help" /> opens the sync-concepts
          glossary.
        </p>
        <p>
          The status bar shows the connection, state counts (click one to filter), and
          {' '}<Strong>Logs</Strong> - every CLI command the app ran, with its output. First stop
          when something misbehaves.
        </p>
        <p>Relaunch this tour any time: palette → <Strong>App: Welcome tour</Strong>.</p>
        <TryButton id="app.help" label="Open the glossary" ctx={ctx} />
      </>
    ),
  },
]

export function Tour({ ctx, onClose }: { ctx: CommandContext, onClose(): void }) {
  const [index, setIndex] = useState(0)
  const step = STEPS[index]
  const last = index === STEPS.length - 1

  useEffect(() => {
    if (!step.target) return
    const target = document.querySelector(`[data-tour="${step.target}"]`)
    target?.classList.add('tour-target')
    return () => target?.classList.remove('tour-target')
  }, [step])

  const card = (
    <div className="pointer-events-auto w-[460px] max-w-[90vw] rounded-xl border border-line-menu bg-overlay shadow-modal">
      <div className="flex items-center gap-3 border-b border-line-subtle px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{step.title}</h2>
        <span className="shrink-0 text-[11px] text-ink-faint">{index + 1} / {STEPS.length}</span>
        <button onClick={onClose} title="Close the tour" className="shrink-0 text-ink-mute hover:text-ink">✕</button>
      </div>
      <div className="max-h-[60vh] space-y-2 overflow-y-auto px-4 py-3 text-[12px] leading-relaxed text-ink-dim">
        {step.body(ctx)}
      </div>
      <div className="flex items-center gap-2 rounded-b-xl border-t border-line-subtle bg-chrome px-4 py-3">
        <span className="flex-1 text-[11px] text-ink-faint">
          {index > 0 && 'The app stays usable - try things as you go.'}
        </span>
        {index > 0
          ? <ModalButton label="Back" onClick={() => setIndex(index - 1)} />
          : <ModalButton label="Skip tour" onClick={onClose} />}
        <ModalButton
          label={last ? 'Finish' : index === 0 ? 'Start tour' : 'Next'}
          primary
          onClick={() => (last ? onClose() : setIndex(index + 1))}
        />
      </div>
    </div>
  )

  // The welcome step sits centered over a scrim; later steps float above the status
  // bar so the spotlighted UI stays visible and interactive. Real modals (z-50)
  // opened from a step render above the tour.
  return index === 0
    ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--scrim)]">{card}</div>
    : <div className="pointer-events-none fixed bottom-11 right-4 z-40">{card}</div>
}
