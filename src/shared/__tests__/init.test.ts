import assert from 'node:assert/strict'
import test from 'node:test'

import { initMessage } from '../init.ts'

test('initMessage lists the frontmatter keys added to a file', () => {
  assert.equal(
    initMessage('1-Backend/eda.md', ['title', 'updated', 'confluenceSpace']),
    'Initialized eda.md: added title, updated, confluenceSpace',
  )
})

test('initMessage reports an already complete file', () => {
  assert.equal(initMessage('1-Backend/eda.md', []), 'Nothing to add to eda.md')
})
