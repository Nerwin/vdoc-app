import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import type { CliOutcome } from '../../shared/cli-status.ts'
import type { DisplayState, SyncGroup } from '../../shared/types.ts'
import { AlertIcon, CheckIcon, CloseIcon, DotIcon } from './icons.tsx'

interface GroupMeta {
  glyph: string
  /** The word that always travels with the glyph. */
  label: string
  /** Tailwind text colour for glyph and word. */
  color: string
}

/** The five R4 states plus the two app-only groups. Amber is never a document state. */
export const GROUP_META: Record<SyncGroup, GroupMeta> = {
  synced: { glyph: '●', label: 'Synced', color: 'text-sync-text' },
  local: { glyph: '↑', label: 'Local changes', color: 'text-behind' },
  remote: { glyph: '↓', label: 'Remote changes', color: 'text-behind' },
  conflict: { glyph: '⚠', label: 'Conflict', color: 'text-conflict' },
  unchecked: { glyph: '○', label: 'Not checked', color: 'text-ink-mute' },
  unlinked: { glyph: '○', label: 'No page linked', color: 'text-ink-mute' },
  ignored: { glyph: '○', label: 'Ignored', color: 'text-ink-mute' },
}

interface StateMeta {
  /** Finer label than the group word where the distinction matters. */
  label: string
  hint?: string
}

export const STATE_META: Record<DisplayState, StateMeta> = {
  'in-sync': { label: 'Synced' },
  'behind': { label: 'Remote changes', hint: 'Confluence moved ahead - pull to refresh the local file' },
  'ahead': { label: 'Local changes', hint: 'Local version is ahead of Confluence - push to publish' },
  'local-edits': { label: 'Local changes', hint: 'The local body changed since the last sync - push to publish' },
  'conflict': { label: 'Conflict', hint: 'Both sides changed since the baseline. Resolve hunk by hunk - never auto-merged' },
  'no-version': { label: 'Never published', hint: 'Tracked but never published by vdoc - push to publish it' },
  'not-found': { label: 'Page not found', hint: 'The Confluence page is gone or not accessible' },
  'untracked': { label: 'No page linked', hint: 'No confluencePageId - link it to an existing page or create one' },
  'unverified': { label: 'Not checked', hint: 'Versions match, but the content was never compared - Check compares it against Confluence and records the baseline when identical' },
  'unchecked': { label: 'Not checked', hint: 'No baseline recorded yet - Check compares the document against Confluence' },
  'ignored': { label: 'Ignored', hint: 'confluenceIgnore is set in the frontmatter - checks, diffs and sync skip this file. Right-click it in the tree to include it again' },
}

interface OutcomeMeta {
  icon: ComponentType<LucideProps>
  label: string
  color: string
}

/** CLI result status from the JSON, not the exit code - see shared/cli-status. */
export const OUTCOME_META: Record<CliOutcome, OutcomeMeta> = {
  success: { icon: CheckIcon, label: 'Success', color: 'text-sync-text' },
  findings: { icon: DotIcon, label: 'Findings', color: 'text-warn-text' },
  warning: { icon: AlertIcon, label: 'Warning', color: 'text-warn-text' },
  error: { icon: CloseIcon, label: 'Error', color: 'text-conflict' },
}
