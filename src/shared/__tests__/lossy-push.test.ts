import assert from 'node:assert/strict'
import test from 'node:test'

import { isLossyPushError, LossyPushAccess } from '../lossy-push.ts'

test('recognizes the CLI validation error that unlocks a lossy push', () => {
  const error = new Error(
    'The remote page has 1 unsupported block(s) (layouts, media, macros) that docs/page.md does not preserve - pushing would delete them from Confluence. Re-pull the file, or re-run with --allow-lossy to overwrite',
  )

  assert.equal(isLossyPushError(error), true)
})

test('does not unlock a lossy push for unrelated failures', () => {
  assert.equal(isLossyPushError(new Error('Authentication failed')), false)
  assert.equal(isLossyPushError('unsupported block(s) that the file does not preserve'), false)
})

test('lossy push access is scoped to one file and revoked after success', () => {
  const access = new LossyPushAccess()
  const error = new Error(
    'The remote page has unsupported blocks that docs/page.md does not preserve; re-run with --allow-lossy',
  )

  assert.equal(access.grantAfterError('docs/page.md', error), true)
  assert.equal(access.allows('docs/page.md'), true)
  assert.equal(access.allows('docs/other.md'), false)

  access.revoke('docs/page.md')
  assert.equal(access.allows('docs/page.md'), false)
})
