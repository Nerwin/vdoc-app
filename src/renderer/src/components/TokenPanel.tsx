import { useState } from 'react'

import type { AuthStatus } from '../../../shared/types.ts'
import { Modal, ModalButton } from './Modal.tsx'

interface Props {
  auth: AuthStatus | null
  busy: boolean
  onSave(token: string): void
  onClose(): void
}

export function TokenPanel({ auth, busy, onSave, onClose }: Props) {
  const [token, setToken] = useState('')

  return (
    <Modal
      title="Confluence session token"
      onClose={onClose}
      actions={(
        <>
          <ModalButton label="Cancel" onClick={onClose} />
          <ModalButton label="Save token" primary disabled={token.trim() === '' || busy} onClick={() => onSave(token)} />
        </>
      )}
    >
      <div className="space-y-2">
        {auth && (
          <p>
            {auth.ok
              ? <>Signed in as <span className="text-ink">{auth.displayName}</span> via {auth.method}.</>
              : <span className="text-conflict">{auth.error ?? 'Not authenticated'}</span>}
          </p>
        )}
        <p>
          Paste the <code className="font-mono">tenant.session.token</code> cookie value. It is stored encrypted via
          <code className="font-mono"> vdoc config set --encrypt</code>.
        </p>
        <textarea
          value={token}
          onChange={event => setToken(event.target.value)}
          rows={4}
          autoFocus
          spellCheck={false}
          placeholder="eyJraWQiOi…"
          className="w-full resize-none rounded-md border border-control bg-raised p-2 font-mono text-[11px] text-ink outline-none"
        />
      </div>
    </Modal>
  )
}
