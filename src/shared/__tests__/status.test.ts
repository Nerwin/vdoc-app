import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { displayState, needsAttention, syncGroup } from '../status.ts'

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

  it('attention is the sum of the actionable groups only', () => {
    assert.ok(needsAttention('behind'))
    assert.ok(needsAttention('conflict'))
    assert.ok(!needsAttention('unverified'))
    assert.ok(!needsAttention('in-sync'))
  })
})
