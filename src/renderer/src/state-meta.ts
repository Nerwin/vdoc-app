import type { DisplayState } from '../../shared/types.ts'

interface StateMeta {
  glyph: string
  label: string
  /** Tailwind text color class for glyphs and pills. */
  color: string
  hint?: string
}

export const STATE_META: Record<DisplayState, StateMeta> = {
  'in-sync': { glyph: '●', label: 'In sync', color: 'text-sync' },
  'behind': { glyph: '↓', label: 'Behind', color: 'text-behind', hint: 'Confluence moved ahead — pull to refresh the local file' },
  'ahead': { glyph: '↑', label: 'Ahead', color: 'text-ahead', hint: 'Local version is ahead of Confluence — push to publish' },
  'local-edits': { glyph: '↑', label: 'Local edits', color: 'text-ahead', hint: 'The local body changed since the last sync — push to publish' },
  'conflict': { glyph: '⇅', label: 'Conflict', color: 'text-conflict', hint: 'Both sides changed. Inspect the diff and merge by hand — never auto-resolve' },
  'no-version': { glyph: '◇', label: 'No version', color: 'text-unknown', hint: 'Tracked but never published by vdoc' },
  'not-found': { glyph: '✕', label: 'Not found', color: 'text-conflict', hint: 'The Confluence page is gone or not accessible' },
  'untracked': { glyph: '·', label: 'Untracked', color: 'text-ink-faint', hint: 'No confluencePageId — link it with sync or publish with create' },
  'unverified': { glyph: '◌', label: 'Unverified', color: 'text-unknown', hint: 'Versions match, but no local baseline exists — local edits cannot be detected. Compare to be sure' },
  'unchecked': { glyph: '…', label: 'Not checked', color: 'text-ink-faint' },
}
