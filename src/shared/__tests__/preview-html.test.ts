import { test } from 'node:test'
import assert from 'node:assert/strict'

import { escapeHtml, previewBody } from '../preview-html.ts'

test('escapeHtml escapes text and attribute delimiters', () => {
  assert.equal(escapeHtml(`<tag data-x="one" data-y='two'>&`), '&lt;tag data-x=&quot;one&quot; data-y=&#39;two&#39;&gt;&amp;')
})

test('previewBody drops the frontmatter and a leading H1', () => {
  assert.equal(previewBody('---\ntitle: T\n---\n\n# Title\n\nBody\n# Later'), '\nBody\n# Later')
  assert.equal(previewBody('Title\n=====\nBody'), 'Body')
})

test('previewBody keeps a document that does not open with an H1', () => {
  assert.equal(previewBody('---\ntitle: T\n---\n## Section\n\n# Late H1'), '## Section\n\n# Late H1')
  assert.equal(previewBody('Intro line\nBody'), 'Intro line\nBody')
  assert.equal(previewBody('#hashtag line'), '#hashtag line')
})
