import assert from 'node:assert/strict'
import test from 'node:test'

import { CloseGuardState } from '../close-guard.ts'

test('close guard requests one save and closes after success', () => {
  const guard = new CloseGuardState()

  assert.equal(guard.requestClose(), 'request-save')
  assert.equal(guard.requestClose(), 'wait')
  assert.equal(guard.completeSave(true), 'close')
  assert.equal(guard.requestClose(), 'close')
})

test('close guard returns to idle when discarding is declined', () => {
  const guard = new CloseGuardState()

  assert.equal(guard.requestClose(), 'request-save')
  assert.equal(guard.completeSave(false), 'confirm-discard')
  assert.equal(guard.requestClose(), 'wait')
  assert.equal(guard.completeDiscard(false), 'keep-open')
  assert.equal(guard.requestClose(), 'request-save')
})

test('close guard closes after discard is confirmed', () => {
  const guard = new CloseGuardState()

  assert.equal(guard.requestClose(), 'request-save')
  assert.equal(guard.completeSave(false), 'confirm-discard')
  assert.equal(guard.completeDiscard(true), 'close')
  assert.equal(guard.requestClose(), 'close')
})
