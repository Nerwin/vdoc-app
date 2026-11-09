import { test } from 'node:test'
import assert from 'node:assert/strict'

import { reviewPrimary, statePrimary } from '../actions.ts'
import type { DisplayState } from '../types.ts'

const STATES: DisplayState[] = ['in-sync', 'behind', 'ahead', 'local-edits', 'no-version', 'conflict', 'not-found', 'unverified', 'unchecked', 'untracked', 'ignored']

test('statePrimary never pushes or pulls a remote or conflicting document outright', () => {
  for (const state of ['behind', 'conflict'] as const) assert.equal(statePrimary(state).commandId, 'view.diff')
  assert.equal(statePrimary('conflict').tone, 'danger')
  assert.equal(statePrimary('not-found').commandId, 'sync.check')
})

test('statePrimary pushes local changes, verifies a missing baseline and checks the unchecked', () => {
  for (const state of ['ahead', 'local-edits', 'no-version'] as const) assert.equal(statePrimary(state).commandId, 'sync.push')
  assert.equal(statePrimary('unverified').commandId, 'sync.baseline')
  assert.equal(statePrimary('unchecked').commandId, 'sync.check')
})

test('statePrimary keeps Synced calm and covers every state', () => {
  assert.equal(statePrimary('in-sync').tone, 'secondary')
  for (const state of STATES) assert.ok(statePrimary(state).commandId)
})

test('reviewPrimary is red whenever a side gets overwritten', () => {
  assert.equal(reviewPrimary('theirs', 'behind').tone, 'primary')
  assert.equal(reviewPrimary('theirs', 'conflict').tone, 'danger')
  assert.equal(reviewPrimary('mine', 'behind').tone, 'danger')
  assert.equal(reviewPrimary('merged', 'conflict').tone, 'danger')
  for (const outcome of ['theirs', 'mine', 'merged'] as const) assert.equal(reviewPrimary(outcome, 'conflict').commandId, 'sync.applyReview')
})
