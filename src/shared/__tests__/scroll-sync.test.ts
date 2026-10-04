import assert from 'node:assert/strict'
import { test } from 'node:test'

import { interpolate } from '../scroll-sync.ts'

test('interpolate maps linearly between anchors and clamps outside them', () => {
  const anchors: Array<[number, number]> = [[0, 0], [100, 400], [200, 500]]
  assert.equal(interpolate(anchors, 50), 200)
  assert.equal(interpolate(anchors, 150), 450)
  assert.equal(interpolate(anchors, 300), 500)
  assert.equal(interpolate(anchors, -10), 0)
})

test('interpolate skips anchors that go backwards', () => {
  assert.equal(interpolate([[0, 0], [100, 300], [80, 50], [200, 400]], 150), 350)
})

test('interpolate without anchors is the identity', () => {
  assert.equal(interpolate([], 42), 42)
})
