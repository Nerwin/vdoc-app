import { useEffect, useState, type ReactNode } from 'react'

import type { AuthStatus, Settings, SettingsInfo } from '../../../shared/types.ts'
import { humanTtl } from '../../../shared/time.ts'
import { ModalButton } from './Modal.tsx'

interface Props {
  settings: SettingsInfo
  auth: AuthStatus | null
  busy: boolean
  spaceMapping: Record<string, string>
  onUpdate(patch: Partial<Settings>): void
  onReloadVersion(): void
  onSaveApiKey(email: string, apiToken: string): void
  onSetAuthMethod(method: 'api-token' | 'session-token'): void
  onAddFolder(): void
  onPickDocsRoot(): void
  onRemoveFolder(path: string): void
  onSetSpaceMapping(dir: string, space: string | null): void
  onRevealConfig(): void
  onRenewToken(): void
  onClose(): void
}

const SECTIONS = ['Appearance', 'Folders & spaces', 'Confluence auth', 'vdoc CLI', 'Config file'] as const
type Section = typeof SECTIONS[number]

export function SettingsModal(props: Props) {
  const [section, setSection] = useState<Section>('Appearance')

  const { onClose } = props
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)]" onClick={props.onClose}>
      <div
        role="dialog"
        aria-modal
        className="flex h-[556px] max-h-[92vh] w-[760px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-line-menu bg-overlay shadow-modal"
        onClick={event => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center border-b border-line-subtle px-[18px] py-3">
          <h2 className="flex-1 text-[14px] font-semibold text-ink">Settings</h2>
          <button
            onClick={props.onClose}
            title="Close — esc"
            className="flex h-6 w-6 items-center justify-center rounded text-[13px] text-ink-mute hover:bg-hover hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav className="w-[188px] shrink-0 space-y-px border-r border-line-subtle bg-sidebar p-2">
            {SECTIONS.map(item => (
              <button
                key={item}
                onClick={() => setSection(item)}
                className={`block w-full rounded-[5px] px-2.5 py-[7px] text-left text-[12.5px] ${
                  item === section
                    ? 'bg-selected text-selected-ink shadow-[inset_2px_0_0_var(--color-select-edge)]'
                    : 'text-ink-dim hover:bg-row-hover hover:text-ink'
                }`}
              >
                {item}
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto px-5 py-[18px]">
            {section === 'Appearance' && <Appearance {...props} />}
            {section === 'Folders & spaces' && <Folders {...props} />}
            {section === 'Confluence auth' && <Auth {...props} />}
            {section === 'vdoc CLI' && <Cli {...props} />}
            {section === 'Config file' && <Config {...props} />}
          </div>
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-line-subtle bg-chrome px-[18px] py-3">
          <span className="truncate font-mono text-[11px] text-ink-mute" title={props.settings.configPath ?? undefined}>
            {props.settings.configPath ?? '.vdocrc not resolved'}
          </span>
          <button
            onClick={props.onRevealConfig}
            disabled={props.settings.configPath === null}
            className="shrink-0 text-[11px] text-accent hover:underline disabled:opacity-40"
          >
            Show in folder
          </button>
          <span className="flex-1" />
          <ModalButton label="Cancel" onClick={props.onClose} />
          <ModalButton label="Done" primary onClick={props.onClose} />
        </footer>
      </div>
    </div>
  )
}

function Appearance({ settings, onUpdate }: Props) {
  return (
    <Section
      title="Appearance"
      description="System follows the OS appearance and switches with it. Light and dark pin the theme for this app only."
    >
      <Segmented
        options={[['light', 'Light'], ['dark', 'Dark'], ['system', 'System']]}
        value={settings.theme}
        onPick={theme => onUpdate({ theme })}
      />
    </Section>
  )
}

function Folders({ settings, spaceMapping, busy, onAddFolder, onPickDocsRoot, onRemoveFolder, onSetSpaceMapping }: Props) {
  const [mapDir, setMapDir] = useState('')
  const [mapSpace, setMapSpace] = useState('')
  const unmapped = settings.contentDirs.filter(dir => !(dir in spaceMapping))

  return (
    <Section
      title="Folders & spaces"
      description="Folders must live inside the docs repository — only Markdown files are listed. The space prefills Create and narrows Sync's title search."
    >
      <Field label="DOCS REPOSITORY">
        <div className="flex items-center gap-2">
          <span
            className="flex-1 truncate rounded-md border border-control bg-pane px-2.5 py-[7px] font-mono text-[12.5px] text-ink-dim"
            title={settings.resolvedRoot}
          >
            {settings.resolvedRoot}
          </span>
          <ModalButton label="Change…" disabled={busy} onClick={onPickDocsRoot} />
        </div>
      </Field>
      <div className="overflow-hidden rounded-md border border-control">
        <div className="grid grid-cols-[1fr_132px_30px] bg-sidebar text-[10.5px] tracking-[1px] text-ink-mute">
          <span className="px-2.5 py-[7px]">FOLDER</span>
          <span className="py-[7px]">SPACE</span>
          <span />
        </div>
        {settings.contentDirs.map(dir => (
          <div key={dir} className="grid grid-cols-[1fr_132px_30px] items-center border-t border-divider">
            <span className="truncate px-2.5 py-[7px] font-mono text-[12.5px] text-ink">{dir}</span>
            {spaceMapping[dir]
              ? (
                  <button
                    onClick={() => onSetSpaceMapping(dir, null)}
                    title={`Remove the ${dir} → ${spaceMapping[dir]} mapping`}
                    className="w-fit rounded border border-info-edge bg-info-bg px-1.5 py-px font-mono text-[11.5px] text-info-ink"
                  >
                    {spaceMapping[dir]}
                  </button>
                )
              : <span className="text-[12px] text-ink-mute">not mapped</span>}
            <button
              onClick={() => onRemoveFolder(dir)}
              title={`Remove ${dir} from the tree`}
              className="flex h-6 w-6 items-center justify-center rounded text-[12px] text-ink-mute hover:bg-danger-bg hover:text-conflict"
            >
              ✕
            </button>
          </div>
        ))}
        {settings.contentDirs.length === 0 && (
          <p className="border-t border-divider px-2.5 py-[7px] text-[12px] text-ink-mute">No folders — the tree is empty.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ModalButton label="+ Add folder…" disabled={busy} onClick={onAddFolder} />
        <div className="flex items-center gap-1.5 rounded-md border border-control px-1.5 py-1">
          <select
            value={unmapped.includes(mapDir) ? mapDir : ''}
            onChange={event => setMapDir(event.target.value)}
            className="rounded border-none bg-transparent font-mono text-[12px] text-ink outline-none"
          >
            <option value="">folder…</option>
            {unmapped.map(dir => <option key={dir} value={dir}>{dir}</option>)}
          </select>
          <span className="text-ink-mute">→</span>
          <input
            value={mapSpace}
            onChange={event => setMapSpace(event.target.value.toUpperCase())}
            placeholder="SPACE"
            spellCheck={false}
            className="w-[74px] rounded border-none bg-transparent font-mono text-[12px] text-ink placeholder-ink-mute outline-none"
          />
        </div>
        <ModalButton
          label="Map"
          disabled={mapDir === '' || mapSpace.trim() === '' || busy}
          onClick={() => {
            onSetSpaceMapping(mapDir, mapSpace)
            setMapDir('')
            setMapSpace('')
          }}
        />
      </div>

      <InfoStrip>Stored in the shared .vdocrc so the CLI reads the same mapping.</InfoStrip>
    </Section>
  )
}

function Auth({ auth, busy, onSaveApiKey, onSetAuthMethod, onRenewToken }: Props) {
  const [method, setMethod] = useState<'api-token' | 'session-token'>(auth?.method === 'api-token' ? 'api-token' : 'session-token')
  const [email, setEmail] = useState(auth?.email ?? '')
  const [apiToken, setApiToken] = useState('')

  const pickMethod = (next: 'api-token' | 'session-token'): void => {
    setMethod(next)
    // Session is always switchable; API key activates on switch only if one is stored.
    if (next === 'session-token' && auth?.method !== 'session-token') onSetAuthMethod('session-token')
    if (next === 'api-token' && auth?.hasApiKey && auth.method !== 'api-token') onSetAuthMethod('api-token')
  }

  const expiryMs = auth?.tokenExp ? auth.tokenExp * 1000 - Date.now() : null

  return (
    <Section
      title="Confluence auth"
      description="A session cookie expires every couple of weeks; an API key does not. Both live in .vdocrc."
    >
      <Segmented
        options={[['session-token', 'Session token'], ['api-token', 'API key']]}
        value={method}
        onPick={pickMethod}
      />

      <div className="flex items-center gap-3 rounded-md border border-control bg-sidebar px-3 py-2.5">
        <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${auth?.ok ? 'bg-sync' : 'bg-conflict'}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] text-ink">
            {auth?.ok ? `Authenticated as ${auth.displayName ?? 'unknown'}` : auth?.error ?? 'Not authenticated'}
          </p>
          {expiryMs !== null && (
            <p className="text-[11px] text-ink-dim">
              {expiryMs <= 0 ? 'token expired' : `expires in ${humanTtl(expiryMs)}`} · session token
            </p>
          )}
        </div>
        {method === 'session-token' && <ModalButton label="Renew…" onClick={onRenewToken} />}
      </div>

      {method === 'api-token' && (
        <>
          <Field label="EMAIL">
            <TextInput value={email} onChange={setEmail} placeholder="you@company.com" />
          </Field>
          <Field label="API TOKEN">
            <div className="flex items-center gap-2">
              <TextInput
                value={apiToken}
                onChange={setApiToken}
                type="password"
                placeholder={auth?.hasApiKey ? 'stored — paste to replace' : 'Atlassian API token'}
              />
              <ModalButton
                label="Save key"
                disabled={email.trim() === '' || apiToken.trim() === '' || busy}
                onClick={() => {
                  onSaveApiKey(email, apiToken)
                  setApiToken('')
                }}
              />
            </div>
          </Field>
          <InfoStrip>Stored encrypted via config set --encrypt and activated immediately.</InfoStrip>
        </>
      )}
    </Section>
  )
}

function Cli({ settings, busy, onUpdate, onReloadVersion }: Props) {
  const [bin, setBin] = useState(settings.vdocBin ?? '')
  const dirty = (bin.trim() || null) !== settings.vdocBin

  return (
    <Section title="vdoc CLI" description="The binary every action runs through. Leave the path empty to auto-detect it.">
      <Field label="BINARY PATH">
        <div className="flex items-center gap-2">
          <TextInput value={bin} onChange={setBin} placeholder={settings.resolvedBin} />
          <ModalButton label="Apply" disabled={!dirty || busy} onClick={() => onUpdate({ vdocBin: bin.trim() || null })} />
        </div>
      </Field>
      <p className="flex items-center gap-2 font-mono text-[11.5px]">
        {settings.version
          ? <span className="text-ink-dim">{settings.version}</span>
          : <span className="text-conflict">cannot run {settings.resolvedBin} — check the path (and that bun is installed)</span>}
        <button
          onClick={onReloadVersion}
          title="Reload version"
          className="rounded border border-control px-1.5 py-0.5 text-ink-dim hover:bg-hover hover:text-ink"
        >
          ↻
        </button>
      </p>
    </Section>
  )
}

function Config({ settings, onRevealConfig }: Props) {
  return (
    <Section
      title="Config file"
      description="One file for the CLI and the app: credentials, auth method, and space mapping all live here."
    >
      <Field label="PATH">
        <div className="flex items-center gap-2">
          <span
            className="flex-1 truncate rounded-md border border-control bg-pane px-2.5 py-[7px] font-mono text-[12.5px] text-ink-dim"
            title={settings.configPath ?? undefined}
          >
            {settings.configPath ?? 'not resolved — is the CLI runnable?'}
          </span>
          <ModalButton label="Show in folder" disabled={settings.configPath === null} onClick={onRevealConfig} />
        </div>
      </Field>
    </Section>
  )
}

function Section({ title, description, children }: { title: string, description: string, children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
        <p className="mt-1 max-w-[460px] text-[11.5px] leading-[1.55] text-ink-dim">{description}</p>
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string, children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] tracking-[1px] text-ink-mute">{label}</span>
      {children}
    </label>
  )
}

function TextInput({ value, onChange, placeholder, type }: {
  value: string
  onChange(value: string): void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      value={value}
      type={type}
      onChange={event => onChange(event.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      className="min-w-0 flex-1 rounded-md border border-control bg-pane px-2.5 py-[7px] font-mono text-[12.5px] text-ink placeholder-ink-mute outline-none"
    />
  )
}

function Segmented<T extends string>({ options, value, onPick }: {
  options: Array<[T, string]>
  value: T
  onPick(value: T): void
}) {
  return (
    <div className="flex w-fit gap-1 rounded-md border border-control bg-sidebar p-[3px]">
      {options.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onPick(key)}
          className={`rounded-[5px] px-3 py-1 text-[12.5px] ${
            key === value ? 'bg-selected text-selected-ink' : 'text-ink-dim hover:text-ink'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function InfoStrip({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-line-subtle bg-sidebar px-3 py-2 text-[11.5px] leading-[1.55] text-ink-dim">
      <span className="text-ink-mute">ⓘ</span>
      <span>{children}</span>
    </p>
  )
}
