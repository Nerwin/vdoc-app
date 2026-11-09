import type { ReviewOutcome } from './review.ts'
import { syncGroup } from './status.ts'
import type { DisplayState } from './types.ts'

export interface PrimaryAction {
  label: string
  commandId: string
  tone: 'primary' | 'secondary' | 'danger'
}

/** One primary per document, derived from its state. Synced is the only calm (secondary) one. */
export function statePrimary(state: DisplayState): PrimaryAction {
  switch (syncGroup(state)) {
    case 'synced': return { label: 'Recheck', commandId: 'sync.check', tone: 'secondary' }
    case 'local': return { label: 'Push to Confluence', commandId: 'sync.push', tone: 'primary' }
    case 'remote': return { label: 'Review changes', commandId: 'view.diff', tone: 'primary' }
    case 'conflict': return state === 'conflict'
      ? { label: 'Resolve conflict', commandId: 'view.diff', tone: 'danger' }
      : { label: 'Recheck', commandId: 'sync.check', tone: 'secondary' }
    case 'unchecked': return state === 'unverified'
      ? { label: 'Verify document', commandId: 'sync.baseline', tone: 'primary' }
      : { label: 'Check document', commandId: 'sync.check', tone: 'primary' }
    case 'unlinked': return { label: 'Create page', commandId: 'sync.create', tone: 'primary' }
    case 'ignored': return { label: 'Open in editor', commandId: 'file.editor', tone: 'secondary' }
  }
}

/** In review, the primary follows the reverted changes - anything that overwrites a side is red. */
export function reviewPrimary(outcome: ReviewOutcome, state: DisplayState): PrimaryAction {
  switch (outcome) {
    case 'theirs': return state === 'conflict'
      ? { label: 'Accept Confluence version', commandId: 'sync.applyReview', tone: 'danger' }
      : { label: 'Pull changes', commandId: 'sync.applyReview', tone: 'primary' }
    case 'mine': return { label: 'Keep mine - overwrite Confluence', commandId: 'sync.applyReview', tone: 'danger' }
    case 'merged': return { label: 'Save merge and push', commandId: 'sync.applyReview', tone: 'danger' }
  }
}
