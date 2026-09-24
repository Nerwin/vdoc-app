import type { CheckFile, DisplayState, SyncGroup } from './types.ts'

export interface FileEntry {
  path: string
  tracked: boolean
  /** Uncommitted git changes - display-only, never feeds sync logic. */
  gitDirty?: boolean
  /** Frontmatter `title:` - shown in the sidebar instead of the filename when present. */
  title?: string
  /** Frontmatter `confluencePageId:` value, when present. */
  pageId?: string
  /** Frontmatter `confluenceIgnore: true` - excluded from every Confluence operation. */
  ignored?: boolean
  /** Frontmatter `vdocHide: true` - never shown in the tree view. */
  hidden?: boolean
  /** Frontmatter `vdocPin: true` - pinned on top of its siblings, after folders. */
  pinned?: boolean
  check?: CheckFile
}

/**
 * CLI state refined with what the app knows locally. `in-sync` with an
 * unknown local-edit baseline is NOT shown as green: version matching alone
 * cannot prove the local body was not edited (state.json has no entry).
 */
export function displayState(entry: FileEntry): DisplayState {
  if (entry.ignored) return 'ignored'
  if (!entry.tracked) return 'untracked'
  if (!entry.check) return 'unchecked'
  if (entry.check.state === 'in-sync' && entry.check.localEdits === undefined) return 'unverified'
  return entry.check.state
}

/** The R4 group a CLI state renders as - state derives from the CLI, never from the UI comparing strings. */
export function syncGroup(state: DisplayState): SyncGroup {
  switch (state) {
    case 'in-sync': return 'synced'
    case 'ahead':
    case 'local-edits':
    case 'no-version': return 'local'
    case 'behind': return 'remote'
    case 'conflict':
    case 'not-found': return 'conflict'
    case 'unverified':
    case 'unchecked': return 'unchecked'
    case 'untracked': return 'unlinked'
    case 'ignored': return 'ignored'
  }
}

/** Groups on the Changes screen, in the fixed order cheap work first, conflicts last. */
export const CHANGE_GROUPS: SyncGroup[] = ['remote', 'local', 'conflict']

/** "Needs attention" is the sum of the actionable groups - a counter, never a state. */
export function needsAttention(state: DisplayState): boolean {
  return CHANGE_GROUPS.includes(syncGroup(state))
}

export interface StateCounts {
  files: number
  tracked: number
  attention: number
  synced: number
  local: number
  remote: number
  conflict: number
  unchecked: number
}

/** Workspace counters - unlinked and Confluence-ignored documents never count toward a state. */
export function countStates(entries: Iterable<FileEntry>): StateCounts {
  const counts: StateCounts = { files: 0, tracked: 0, attention: 0, synced: 0, local: 0, remote: 0, conflict: 0, unchecked: 0 }
  for (const entry of entries) {
    counts.files += 1
    if (entry.tracked) counts.tracked += 1
    const state = displayState(entry)
    const group = syncGroup(state)
    if (group === 'unlinked' || group === 'ignored') continue
    counts[group] += 1
    if (needsAttention(state)) counts.attention += 1
  }
  return counts
}

export const displayTitle = (entry: FileEntry): string => entry.title ?? entry.path.split('/').at(-1) ?? entry.path
