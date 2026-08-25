import assert from 'node:assert/strict'
import test from 'node:test'

import { clipboardText } from '../clipboard.ts'

test('clipboardText accepts renderer text without changing it', () => {
  assert.equal(clipboardText('vdoc cf check "docs/page.md"'), 'vdoc cf check "docs/page.md"')
  assert.equal(clipboardText(''), '')
})

test('clipboardText rejects non-text and oversized IPC input', () => {
  assert.throws(() => clipboardText({ text: 'unsafe' }), /Invalid clipboard text/)
  assert.throws(() => clipboardText('x'.repeat(1024 * 1024 + 1)), /Invalid clipboard text/)
})
