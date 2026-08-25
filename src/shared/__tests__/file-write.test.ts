import assert from 'node:assert/strict'
import test from 'node:test'

import { contentForGuardedWrite } from '../file-write.ts'

test('guarded writes accept the exact content previously read', () => {
  assert.equal(contentForGuardedWrite('# Old\n', '# Old\n', '# New\n'), '# New\n')
})

test('guarded writes reject content changed by another process', () => {
  assert.throws(
    () => contentForGuardedWrite('# External edit\n', '# Old\n', '# Draft\n'),
    /changed on disk/,
  )
})
