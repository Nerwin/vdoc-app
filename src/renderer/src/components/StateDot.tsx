import type { DisplayState } from '../../../shared/types.ts'
import { STATE_META } from '../state-meta.ts'

/** The 7px sync-state dot: filled = known state, ring = unverified. */
export function StateDot({ state, pulse, dim }: { state: DisplayState, pulse?: boolean, dim?: boolean }) {
  return (
    <span
      className={`h-[7px] w-[7px] shrink-0 rounded-full ${STATE_META[state].dot} ${pulse ? 'animate-pulse' : ''} ${dim ? 'opacity-40' : ''}`}
    />
  )
}
