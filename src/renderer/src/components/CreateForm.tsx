import { useState } from 'react'

import { Modal, ModalButton } from './Modal.tsx'

interface Props {
  path: string
  defaultSpace: string
  busy: boolean
  onSubmit(space: string, parent: string): void
  onClose(): void
}

export function CreateForm({ path, defaultSpace, busy, onSubmit, onClose }: Props) {
  const [space, setSpace] = useState(defaultSpace)
  const [parent, setParent] = useState('')

  return (
    <Modal
      title={`Create Confluence page for ${path.split('/').at(-1)}`}
      onClose={onClose}
      actions={(
        <>
          <ModalButton label="Cancel" onClick={onClose} />
          <ModalButton label="Create page" primary disabled={space.trim() === '' || busy} onClick={() => onSubmit(space, parent)} />
        </>
      )}
    >
      <div className="space-y-3">
        <p>
          Creates a new page from this file and backfills its tracking frontmatter
          (<code className="font-mono">confluencePageId</code>, space, version).
        </p>
        <label className="block">
          <span className="mb-1 block text-[11px] text-ink-faint">Space key</span>
          <input
            value={space}
            onChange={event => setSpace(event.target.value.toUpperCase())}
            placeholder="BACK"
            spellCheck={false}
            className="w-32 rounded-md border border-control bg-raised px-2 py-1.5 font-mono text-[12px] text-ink outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-ink-faint">Parent page ID (optional - created at the space root when empty)</span>
          <input
            value={parent}
            onChange={event => setParent(event.target.value)}
            autoFocus
            placeholder="5013700642"
            spellCheck={false}
            className="w-56 rounded-md border border-control bg-raised px-2 py-1.5 font-mono text-[12px] text-ink outline-none"
          />
        </label>
      </div>
    </Modal>
  )
}
