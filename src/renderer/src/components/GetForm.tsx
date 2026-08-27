import { useState } from 'react'

import { confluencePageId } from '../../../shared/links.ts'
import { Modal, ModalButton } from './Modal.tsx'

interface Props {
  /** Root folders the tree shows - the destinations offered by the select. */
  folders: string[]
  /** Destination fixed by the tree's folder context menu - hides the select, allows nested folders. */
  presetDir?: string
  busy: boolean
  /** Tracked file already carrying this page id, or null. */
  findExisting(pageId: string): Promise<string | null>
  onOpenExisting(path: string): void
  onSubmit(input: string, dir: string, recursive: boolean): void
  onClose(): void
}

export function GetForm({ folders, presetDir, busy, findExisting, onOpenExisting, onSubmit, onClose }: Props) {
  const [dir, setDir] = useState(presetDir ?? folders[0] ?? '')
  const [input, setInput] = useState('')
  const [recursive, setRecursive] = useState(false)
  const [existing, setExisting] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const pageId = confluencePageId(input.trim())

  const submit = (): void => {
    if (!pageId || busy || checking) return
    // Recursive skips the duplicate gate: the CLI skips tracked pages but still fetches their children.
    if (recursive) {
      onSubmit(input, dir, true)
      return
    }
    setChecking(true)
    void findExisting(pageId).then(found => {
      setChecking(false)
      if (found) setExisting(found)
      else onSubmit(input, dir, false)
    })
  }

  return (
    <Modal
      title="Get page from Confluence"
      onClose={onClose}
      actions={existing
        ? (
            <>
              <ModalButton label="Cancel" onClick={onClose} />
              <ModalButton label="Open local file" primary onClick={() => onOpenExisting(existing)} />
            </>
          )
        : (
            <>
              <ModalButton label="Cancel" onClick={onClose} />
              <ModalButton label={recursive ? 'Get pages' : 'Get page'} primary disabled={pageId === null || busy || checking} onClick={submit} />
            </>
          )}
    >
      <div className="space-y-3">
        <p>
          Downloads the page as a Markdown file with tracking frontmatter.
          The file is named after the page title.
        </p>
        <label className="block">
          <span className="mb-1 block text-[11px] text-ink-faint">Create in folder</span>
          {presetDir
            ? <span className="block font-mono text-[12px] text-ink">{presetDir}</span>
            : (
                <select
                  value={dir}
                  onChange={event => setDir(event.target.value)}
                  className="w-56 rounded-md border border-control bg-raised px-2 py-1.5 font-mono text-[12px] text-ink outline-none"
                >
                  {folders.map(folder => <option key={folder} value={folder}>{folder}</option>)}
                </select>
              )}
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-ink-faint">Page URL or ID</span>
          <input
            value={input}
            onChange={event => {
              setInput(event.target.value)
              setExisting(null)
            }}
            onKeyDown={event => event.key === 'Enter' && submit()}
            autoFocus
            placeholder="5013700642 or https://…/wiki/spaces/KEY/pages/…"
            spellCheck={false}
            className="w-full rounded-md border border-control bg-raised px-2 py-1.5 font-mono text-[12px] text-ink outline-none"
          />
        </label>
        {input.trim() !== '' && pageId === null && (
          <p className="text-[11px] text-warn">Enter a numeric page ID or a Confluence page URL.</p>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={recursive} onChange={event => setRecursive(event.target.checked)} />
          <span className="text-[12px] text-ink-body">Include all nested pages</span>
        </label>
        {recursive && (
          <p className="text-[11px] text-ink-faint">
            Every sub-page is written into the folder as its own file; already-tracked pages are skipped.
          </p>
        )}
        {existing && (
          <p className="text-[11px] text-warn">
            Page {pageId} is already tracked by <span className="font-mono text-ink">{existing}</span> - open it instead of fetching a duplicate.
          </p>
        )}
      </div>
    </Modal>
  )
}
