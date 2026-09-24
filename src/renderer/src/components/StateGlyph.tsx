import type { CliOutcome } from '../../../shared/cli-status.ts'
import type { SyncGroup } from '../../../shared/types.ts'
import { GROUP_META, OUTCOME_META } from '../state-meta.ts'

/**
 * State glyph, optionally with its word. Alone only in the tree (the sidebar legend
 * defines the alphabet); everywhere else glyph and word travel together.
 */
export function StateGlyph({ group, word, className = '' }: { group: SyncGroup, word?: string | true, className?: string }) {
  const meta = GROUP_META[group]
  return (
    <span className={`inline-flex items-center gap-[7px] whitespace-nowrap ${meta.color} ${className}`}>
      <span aria-hidden={word ? undefined : false}>{meta.glyph}</span>
      {word && <span>{word === true ? meta.label : word}</span>}
    </span>
  )
}

/** CLI result icon; the findings dot is drawn smaller so it reads as a dot, not a disc. */
export function OutcomeIcon({ outcome, size = 12 }: { outcome: CliOutcome, size?: number }) {
  const meta = OUTCOME_META[outcome]
  return <meta.icon size={outcome === 'findings' ? size * 0.75 : size} className={`shrink-0 ${meta.color}`} />
}
