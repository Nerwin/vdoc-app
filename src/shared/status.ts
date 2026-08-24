import type { CheckFile, DisplayState } from './types.ts'

export interface FileEntry {
  path: string
  tracked: boolean
  /** Uncommitted git changes - display-only, never feeds sync logic. */
  gitDirty?: boolean
  /** Frontmatter `title:` - shown in the sidebar instead of the filename when present. */
  title?: string
  check?: CheckFile
}

/**
 * CLI state refined with what the app knows locally. `in-sync` with an
 * unknown local-edit baseline is NOT shown as green: version matching alone
 * cannot prove the local body was not edited (state.json has no entry).
 */
export function displayState(entry: FileEntry): DisplayState {
  if (!entry.tracked) return 'untracked'
  if (!entry.check) return 'unchecked'
  if (entry.check.state === 'in-sync' && entry.check.localEdits === undefined) return 'unverified'
  return entry.check.state
}

/** States that need the user's attention, in severity order. */
export const ATTENTION_STATES: DisplayState[] = ['conflict', 'not-found', 'local-edits', 'ahead', 'behind']

export function needsAttention(state: DisplayState): boolean {
  return ATTENTION_STATES.includes(state)
}
