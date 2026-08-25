import assert from 'node:assert/strict'
import test from 'node:test'

import { CancellableOperation } from '../cancellable-operation.ts'

test('cancellable operation aborts the active signal and resets after finish', () => {
  const operation = new CancellableOperation()
  const signal = operation.start()

  assert.equal(operation.running, true)
  operation.cancel()
  assert.equal(signal.aborted, true)
  assert.throws(() => operation.start(), /already running/)

  operation.finish(signal)
  assert.equal(operation.running, false)
  assert.equal(operation.start().aborted, false)
})

test('finishing a stale signal does not clear the active operation', () => {
  const operation = new CancellableOperation()
  const first = operation.start()
  operation.finish(first)
  const second = operation.start()

  operation.finish(first)
  assert.equal(operation.running, true)
  operation.finish(second)
  assert.equal(operation.running, false)
})
