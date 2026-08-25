import assert from 'node:assert/strict'
import test from 'node:test'

import { updateCheckMessage } from '../update.ts'

test('describes available and downloaded versions', () => {
  assert.equal(
    updateCheckMessage({ phase: 'downloading', current: '1.0.0', latest: '1.1.0', progress: 42 }),
    'V-DOC 1.1.0 is available and downloading',
  )
  assert.equal(
    updateCheckMessage({ phase: 'downloaded', current: '1.0.0', latest: '1.1.0', progress: 100 }),
    'V-DOC 1.1.0 is ready to install',
  )
})

test('keeps update failures and unsupported environments generic', () => {
  assert.equal(
    updateCheckMessage({ phase: 'error', current: '1.0.0' }),
    'Unable to check for updates',
  )
  assert.equal(
    updateCheckMessage({ phase: 'unsupported', current: '1.0.0' }),
    'Automatic updates are available in packaged builds',
  )
})
