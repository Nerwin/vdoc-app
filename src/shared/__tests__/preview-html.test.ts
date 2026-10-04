import { test } from 'node:test'
import assert from 'node:assert/strict'

import { escapeHtml, previewBody, withSourceLine } from '../preview-html.ts'

test('escapeHtml escapes text and attribute delimiters', () => {
  assert.equal(escapeHtml(`<tag data-x="one" data-y='two'>&`), '&lt;tag data-x=&quot;one&quot; data-y=&#39;two&#39;&gt;&amp;')
})

test('previewBody drops only the frontmatter and reports the line the body starts on', () => {
  assert.deepEqual(previewBody('---\ntitle: T\n---\n\n# Title\nBody'), { body: '\n# Title\nBody', firstLine: 4 })
  assert.deepEqual(previewBody('---\r\ntitle: T\r\n---\r\n# Title'), { body: '# Title', firstLine: 4 })
  assert.deepEqual(previewBody('# Title\nBody'), { body: '# Title\nBody', firstLine: 1 })
})

test('withSourceLine tags the opening element only', () => {
  assert.equal(withSourceLine('<p>a <em>b</em></p>\n', 7), '<p data-line="7">a <em>b</em></p>\n')
  assert.equal(withSourceLine('<hr>', 2), '<hr data-line="2">')
  assert.equal(withSourceLine('&lt;div&gt;', 3), '&lt;div&gt;')
})
