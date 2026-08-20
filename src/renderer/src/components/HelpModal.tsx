import type { DisplayState } from '../../../shared/types.ts'
import { STATE_META } from '../state-meta.ts'
import { Modal, ModalButton } from './Modal.tsx'

const CONCEPTS: Array<{ term: string, text: string }> = [
  {
    term: 'Check',
    text: 'Read-only. Compares the version number in the file\'s frontmatter with the page version on Confluence, plus the recorded baseline. Never changes anything, locally or remotely.',
  },
  {
    term: 'Baseline',
    text: 'A fingerprint of the file\'s content, stored in .vdoc/state.json inside the docs repository whenever local and Confluence are known to be identical (after a pull, push, get, or successful Verify). It is how local edits are detected: no baseline means a version match cannot prove the contents still agree — the file shows as Unverified.',
  },
  {
    term: 'Verify',
    text: 'Fetches the page and compares the actual content. Identical → records the baseline and the file becomes Synced. Different → opens the diff so you decide: Pull to take Confluence, or Push to publish your local version.',
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

/** States with a hint, in lifecycle order — the confusing one (unverified) up front. */
const STATE_ORDER: DisplayState[] = ['unverified', 'behind', 'ahead', 'local-edits', 'conflict', 'no-version', 'not-found', 'untracked']

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
          <div className="border-t border-line-subtle pb-2 pt-3 text-[10.5px] tracking-[0.12em] text-ink-ghost">FILE STATES</div>
          <div className="space-y-2">
            {STATE_ORDER.map(state => (
              <div key={state}>
                <span className={`mr-2 inline-block rounded-full border px-2 py-px text-[11px] ${STATE_META[state].chip}`}>
                  {STATE_META[state].label}
                </span>
                <span className="leading-relaxed">{STATE_META[state].hint}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
