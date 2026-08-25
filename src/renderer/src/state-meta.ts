import type { DisplayState } from '../../shared/types.ts'

interface StateMeta {
  label: string
  /** Complete class set for a 7px state dot - filled = known state, ring = unverified. */
  dot: string
  /** Tailwind text color class for glyphs and labels. */
  color: string
  /** Chip tint: background + border + text (dark-spec tints from the redesign). */
  chip: string
  /** Tree right-edge glyph - only for states with something to report. */
  glyph?: string
  hint?: string
}

const RING = 'border-[1.5px] border-warn'
const CHIP_GREEN = 'bg-ok-bg border-ok-edge text-ok-ink'
const CHIP_AMBER = 'bg-pill-bg border-pill-edge text-pill-ink'
const CHIP_BLUE = 'bg-info-bg border-info-edge text-info-ink'
const CHIP_RED = 'bg-bad-bg border-bad-edge text-bad-ink'
const CHIP_GREY = 'bg-raised border-control text-ink-mute'

export const STATE_META: Record<DisplayState, StateMeta> = {
  'in-sync': { label: 'Synced', dot: 'bg-sync', color: 'text-sync-text', chip: CHIP_GREEN },
  'behind': { label: 'Behind', dot: 'bg-behind', color: 'text-behind', chip: CHIP_BLUE, glyph: '↓', hint: 'Confluence moved ahead - pull to refresh the local file' },
  'ahead': { label: 'Ahead', dot: 'bg-behind', color: 'text-behind', chip: CHIP_BLUE, glyph: '↑', hint: 'Local version is ahead of Confluence - push to publish' },
  'local-edits': { label: 'Local edits', dot: 'bg-behind', color: 'text-behind', chip: CHIP_BLUE, glyph: '↑', hint: 'The local body changed since the last sync - push to publish' },
  'conflict': { label: 'Diverged', dot: 'bg-conflict', color: 'text-conflict', chip: CHIP_RED, glyph: '≠', hint: 'Both sides changed. Inspect the diff and merge by hand - never auto-resolve' },
  'no-version': { label: 'No version', dot: RING, color: 'text-warn-text', chip: CHIP_AMBER, hint: 'Tracked but never published by vdoc - push to publish it' },
  'not-found': { label: 'Not found', dot: 'bg-conflict', color: 'text-conflict', chip: CHIP_RED, glyph: '⚠', hint: 'The Confluence page is gone or not accessible' },
  'untracked': { label: 'Not linked', dot: 'bg-dot-neutral', color: 'text-ink-mute', chip: CHIP_GREY, hint: 'No confluencePageId - link it with Find matching page or publish with Create' },
  'unverified': { label: 'Unverified', dot: RING, color: 'text-warn-text', chip: CHIP_AMBER, hint: 'Versions match, but the content was never compared - edits on either side would go unnoticed. Verify fetches the page: identical content records a baseline and turns this Synced; different content opens the diff so you choose (Pull takes Confluence, Push publishes local)' },
  'unchecked': { label: 'Not checked', dot: 'bg-dot-neutral', color: 'text-ink-faint', chip: CHIP_GREY },
  'ignored': { label: 'Ignored', dot: 'bg-dot-neutral', color: 'text-ink-faint', chip: CHIP_GREY, glyph: '⊘', hint: 'confluenceIgnore is set in the frontmatter - checks, diffs and sync skip this file. Right-click it in the tree to include it again' },
}
