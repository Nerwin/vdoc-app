import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isNewerVersion } from '../version.ts'

test('isNewerVersion compares x.y.z numerically', () => {
  assert.equal(isNewerVersion('1.9.0', '1.8.0'), true)
  assert.equal(isNewerVersion('2.0.0', '1.99.99'), true)
  assert.equal(isNewerVersion('1.8.1', '1.8.0'), true)
  assert.equal(isNewerVersion('1.8.0', '1.8.0'), false)
  assert.equal(isNewerVersion('1.7.9', '1.8.0'), false)
  assert.equal(isNewerVersion('1.10.0', '1.9.0'), true)
})

test('isNewerVersion ignores a leading v and tolerates junk', () => {
  assert.equal(isNewerVersion('v1.9.0', '1.8.0'), true)
  assert.equal(isNewerVersion('v1.8.0', 'v1.8.0'), false)
  assert.equal(isNewerVersion('', '1.8.0'), false)
  assert.equal(isNewerVersion('garbage', '1.8.0'), false)
})
