import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { countStates, displayState, needsAttention, syncGroup } from '../status.ts'

describe('sync state model', () => {
  it('maps every CLI state to one of the five groups', () => {
    assert.equal(syncGroup('in-sync'), 'synced')
    assert.equal(syncGroup('behind'), 'remote')
    for (const state of ['ahead', 'local-edits', 'no-version'] as const) assert.equal(syncGroup(state), 'local')
    for (const state of ['conflict', 'not-found'] as const) assert.equal(syncGroup(state), 'conflict')
    for (const state of ['unverified', 'unchecked'] as const) assert.equal(syncGroup(state), 'unchecked')
    assert.equal(syncGroup('untracked'), 'unlinked')
  })

  it('never shows a version match without a baseline as synced', () => {
    const entry = { path: 'a.md', tracked: true, check: { file: 'a.md', state: 'in-sync' as const } }
    assert.equal(displayState(entry), 'unverified')
    assert.equal(displayState({ ...entry, check: { ...entry.check, localEdits: false } }), 'in-sync')
  })

  it('counts states without unlinked or Confluence-ignored documents', () => {
    const check = (state: 'behind' | 'conflict' | 'in-sync') => ({ file: 'x.md', state, localEdits: false })
    const counts = countStates([
      { path: 'a.md', tracked: true, check: check('behind') },
      { path: 'b.md', tracked: true, check: check('conflict') },
      { path: 'c.md', tracked: true, check: check('in-sync') },
      { path: 'd.md', tracked: true },
      { path: 'e.md', tracked: false },
      { path: 'f.md', tracked: true, ignored: true, check: check('behind') },
    ])
    assert.deepEqual(counts, { files: 6, tracked: 5, attention: 2, synced: 1, local: 0, remote: 1, conflict: 1, unchecked: 1 })
  })

  it('attention is the sum of the actionable groups only', () => {
    assert.ok(needsAttention('behind'))
    assert.ok(needsAttention('conflict'))
    assert.ok(!needsAttention('unverified'))
    assert.ok(!needsAttention('in-sync'))
  })
})
