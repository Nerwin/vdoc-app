import { useState } from 'react'

import type { SettingsInfo } from '../../../shared/types.ts'
import { Modal, ModalButton } from './Modal.tsx'

interface Props {
  settings: SettingsInfo
  busy: boolean
  onUpdate(patch: { theme?: 'dark' | 'light', vdocBin?: string | null }): void
  onReloadVersion(): void
  onClose(): void
}

export function SettingsModal({ settings, busy, onUpdate, onReloadVersion, onClose }: Props) {
  const [bin, setBin] = useState(settings.vdocBin ?? '')
  const binDirty = (bin.trim() || null) !== settings.vdocBin

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
              : <span className="text-conflict">binary not found at {settings.resolvedBin}</span>}
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
