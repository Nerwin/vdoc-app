import { test } from 'node:test'
import assert from 'node:assert/strict'

import { OperationTickets } from '../operation-tickets.ts'

test('operation tickets are single-use', () => {
  const tickets = new OperationTickets<{ path: string }>(1000, 10)
  tickets.issue('one', { path: 'docs/one.md' })

  assert.deepEqual(tickets.take('one'), { path: 'docs/one.md' })
  assert.throws(() => tickets.take('one'), /Preview expired/)
})

test('operation tickets expire', () => {
  let now = 100
  const tickets = new OperationTickets<string>(50, 10, () => now)
  tickets.issue('one', 'payload')
  now = 151

  assert.throws(() => tickets.take('one'), /Preview expired/)
})

test('operation tickets discard the oldest entry at capacity', () => {
  const tickets = new OperationTickets<string>(1000, 2)
  tickets.issue('one', 'first')
  tickets.issue('two', 'second')
  tickets.issue('three', 'third')

  assert.throws(() => tickets.take('one'), /Preview expired/)
  assert.equal(tickets.take('two'), 'second')
  assert.equal(tickets.take('three'), 'third')
})
