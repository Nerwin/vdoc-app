import assert from 'node:assert/strict'
import test from 'node:test'

import { isIgnoredWatchPath } from '../watch-policy.ts'

const excluded = new Set(['Images', 'Private', 'node_modules'])

test('watch paths ignore hidden and excluded directory segments', () => {
  assert.equal(isIgnoredWatchPath('guide/readme.md', excluded), false)
  assert.equal(isIgnoredWatchPath('.cache/readme.md', excluded), true)
  assert.equal(isIgnoredWatchPath('guide/Images/diagram.md', excluded), true)
  assert.equal(isIgnoredWatchPath('guide/node_modules/package/readme.md', excluded), true)
})
