import { test } from 'node:test'
import assert from 'node:assert/strict'

import { humanTtl, timeAgo } from '../time.ts'

test('humanTtl steps days → hours → minutes', () => {
  assert.equal(humanTtl(50 * 3_600_000), '2d 2h')
  assert.equal(humanTtl(5 * 3_600_000), '5h')
  assert.equal(humanTtl(1), '1m')
})

test('timeAgo accepts ms, Date, and ISO strings', () => {
  const now = Date.now()
  assert.equal(timeAgo(now), 'just now')
  assert.equal(timeAgo(new Date(now - 5 * 60_000)), '5m ago')
  assert.equal(timeAgo(new Date(now - 3 * 3_600_000).toISOString()), '3h ago')
  assert.equal(timeAgo(now - 49 * 3_600_000), '2d ago')
})
