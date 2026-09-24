import type { DisplayState } from '../../../shared/types.ts'
import { syncGroup } from '../../../shared/status.ts'
import { STATE_META } from '../state-meta.ts'
import { Modal, ModalButton } from './Modal.tsx'
import { StateGlyph } from './StateGlyph.tsx'

const CONCEPTS: Array<{ term: string, text: string }> = [
  {
    term: 'Check',
    text: 'Read-only. Compares the version number in the file\'s frontmatter with the page version on Confluence, plus the recorded baseline. Never changes anything, locally or remotely.',
  },
  {
    term: 'Baseline',
    text: 'A fingerprint of the file\'s content, stored in .vdoc/state.json inside the docs repository whenever local and Confluence are known to be identical (after a pull, push, get, or successful Verify). It is how local edits are detected: no baseline means a version match cannot prove the contents still agree - the document shows as Not checked.',
  },
  {
    term: 'Verify',
    text: 'Fetches the page and compares the actual content. Identical → records the baseline and the document becomes Synced. Different → opens the diff so you decide: Pull to take Confluence, or Push to publish your local version.',
  },
  {
    term: 'Conflict',
    text: 'Both sides changed since the baseline. Resolve keeps or discards each hunk (mine, theirs, or both), writes the merged document, and pushes it as one force push after the usual preview and red confirmation. Nothing is ever auto-merged.',
  },
  {
    term: 'Pull',
    text: 'Rewrites the local file from Confluence and records a fresh baseline. Force pull also overwrites local edits and refreshes a same-version file whose content drifted.',
  },
  {
    term: 'Push',
    text: 'Publishes the local file to Confluence as a new page version (the app always shows a dry-run preview first). Force push overrides the guard that stops you when Confluence moved since your last pull.',
  },
]

/** States with a hint, in lifecycle order - the confusing one (not checked) up front. */
const STATE_ORDER: DisplayState[] = ['unverified', 'behind', 'ahead', 'local-edits', 'conflict', 'no-version', 'not-found', 'untracked', 'ignored']

export function HelpModal({ onClose }: { onClose(): void }) {
  return (
    <Modal title="Sync concepts" onClose={onClose} actions={<ModalButton label="Close" onClick={onClose} />}>
      <div className="space-y-3">
        {CONCEPTS.map(concept => (
          <div key={concept.term}>
            <div className="pb-0.5 text-[12px] font-semibold text-ink">{concept.term}</div>
            <p className="leading-relaxed">{concept.text}</p>
          </div>
        ))}

        <div className="pt-1">
          <div className="border-t border-line-subtle pb-2 pt-3 text-[10.5px] tracking-[0.12em] text-ink-label">DOCUMENT STATES</div>
          <div className="space-y-2">
            {STATE_ORDER.map(state => (
              <div key={state}>
                <StateGlyph group={syncGroup(state)} word={STATE_META[state].label} className="mr-2 text-[11.5px]" />
                <span className="leading-relaxed">{STATE_META[state].hint}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
