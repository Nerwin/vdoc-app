import { useState } from 'react'

import type { AuthStatus, SettingsInfo } from '../../../shared/types.ts'
import { Modal, ModalButton } from './Modal.tsx'

interface Props {
  settings: SettingsInfo
  auth: AuthStatus | null
  busy: boolean
  onUpdate(patch: { theme?: 'dark' | 'light', vdocBin?: string | null }): void
  onReloadVersion(): void
  onSaveApiKey(email: string, apiToken: string): void
  onSetAuthMethod(method: 'api-token' | 'session-token'): void
  onAddFolder(): void
  onRemoveFolder(path: string): void
  onClose(): void
}

export function SettingsModal({ settings, auth, busy, onUpdate, onReloadVersion, onSaveApiKey, onSetAuthMethod, onAddFolder, onRemoveFolder, onClose }: Props) {
  const [bin, setBin] = useState(settings.vdocBin ?? '')
  const binDirty = (bin.trim() || null) !== settings.vdocBin
  const [method, setMethod] = useState<'api-token' | 'session-token'>(auth?.method === 'api-token' ? 'api-token' : 'session-token')
  const [email, setEmail] = useState(auth?.email ?? '')
  const [apiToken, setApiToken] = useState('')

  const pickMethod = (next: 'api-token' | 'session-token'): void => {
    setMethod(next)
    // Session is always switchable; API key activates on switch only if one is stored.
    if (next === 'session-token' && auth?.method !== 'session-token') onSetAuthMethod('session-token')
    if (next === 'api-token' && auth?.hasApiKey && auth.method !== 'api-token') onSetAuthMethod('api-token')
  }

  return (
    <Modal
      title="Settings"
      onClose={onClose}
      actions={<ModalButton label="Done" primary onClick={onClose} />}
    >
      <div className="space-y-5">
        <section>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Theme</h3>
          <div className="flex w-fit overflow-hidden rounded-md border border-line">
            {(['light', 'dark'] as const).map(theme => (
              <button
                key={theme}
                onClick={() => onUpdate({ theme })}
                className={`px-3 py-1.5 text-[12px] capitalize ${
                  settings.theme === theme ? 'bg-raised text-ink' : 'bg-panel text-ink-dim hover:text-ink'
                }`}
              >
                {theme}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Folders</h3>
          <ul className="mb-2 space-y-1">
            {settings.contentDirs.map(dir => (
              <li key={dir} className="flex items-center gap-2 rounded-md border border-line bg-bg px-2.5 py-1.5">
                <span className="flex-1 truncate font-mono text-[12px] text-ink">{dir}</span>
                <button
                  onClick={() => onRemoveFolder(dir)}
                  title={`Remove ${dir} from the tree`}
                  className="text-[12px] text-ink-faint hover:text-conflict"
                >
                  ✕
                </button>
              </li>
            ))}
            {settings.contentDirs.length === 0 && (
              <li className="text-[11px] text-ink-faint">No folders — the tree is empty.</li>
            )}
          </ul>
          <ModalButton label="Add folder…" disabled={busy} onClick={onAddFolder} />
          <p className="mt-1 text-[11px] text-ink-faint">
            Folders must live inside the docs repository. Only Markdown files are ever listed.
          </p>
        </section>

        <section>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Confluence authentication</h3>
          <div className="flex w-fit overflow-hidden rounded-md border border-line">
            <button
              onClick={() => pickMethod('session-token')}
              className={`px-3 py-1.5 text-[12px] ${method === 'session-token' ? 'bg-raised text-ink' : 'bg-panel text-ink-dim hover:text-ink'}`}
            >
              Session token
            </button>
            <button
              onClick={() => pickMethod('api-token')}
              className={`px-3 py-1.5 text-[12px] ${method === 'api-token' ? 'bg-raised text-ink' : 'bg-panel text-ink-dim hover:text-ink'}`}
            >
              API key
            </button>
          </div>
          {method === 'session-token' && (
            <p className="mt-1.5 text-[11px] text-ink-faint">
              Cookie-based, expires every couple of weeks — renew it from the status-bar chip.
            </p>
          )}
          {method === 'api-token' && (
            <div className="mt-2 space-y-2">
              <input
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="you@company.com"
                spellCheck={false}
                className="w-72 rounded-md border border-line bg-bg px-2 py-1.5 font-mono text-[12px] text-ink placeholder-ink-faint outline-none focus:border-accent"
              />
              <div className="flex items-center gap-2">
                <input
                  value={apiToken}
                  onChange={event => setApiToken(event.target.value)}
                  type="password"
                  placeholder={auth?.hasApiKey ? 'API token stored — paste to replace' : 'Atlassian API token'}
                  spellCheck={false}
                  className="w-72 rounded-md border border-line bg-bg px-2 py-1.5 font-mono text-[12px] text-ink placeholder-ink-faint outline-none focus:border-accent"
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
              <p className="text-[11px] text-ink-faint">
                Stored encrypted via <code className="font-mono">config set --encrypt</code> and activated immediately.
              </p>
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">vdoc CLI</h3>
          <div className="flex items-center gap-2">
            <input
              value={bin}
              onChange={event => setBin(event.target.value)}
              placeholder={settings.resolvedBin}
              spellCheck={false}
              className="flex-1 rounded-md border border-line bg-bg px-2 py-1.5 font-mono text-[12px] text-ink placeholder-ink-faint outline-none focus:border-accent"
            />
            <ModalButton
              label="Apply"
              disabled={!binDirty || busy}
              onClick={() => onUpdate({ vdocBin: bin.trim() || null })}
            />
          </div>
          <p className="mt-1 text-[11px] text-ink-faint">Binary path — leave empty to auto-detect.</p>
          <p className="mt-2 flex items-center gap-2 font-mono text-[11px]">
            {settings.version
              ? <span className="text-ink-dim">{settings.version}</span>
              : <span className="text-conflict">cannot run {settings.resolvedBin} — check the path (and that bun is installed)</span>}
            <button
              onClick={onReloadVersion}
              title="Reload version"
              className="rounded border border-line px-1.5 py-0.5 text-ink-dim hover:bg-raised hover:text-ink"
            >
              ↻
            </button>
          </p>
        </section>
      </div>
    </Modal>
  )
}
