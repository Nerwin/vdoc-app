import { test } from 'node:test'
import assert from 'node:assert/strict'

import { escapeHtml, previewMetaLine } from '../preview-html.ts'

test('escapeHtml escapes text and attribute delimiters', () => {
  assert.equal(escapeHtml(`<tag data-x="one" data-y='two'>&`), '&lt;tag data-x=&quot;one&quot; data-y=&#39;two&#39;&gt;&amp;')
})

test('previewMetaLine keeps frontmatter inside its status attribute', () => {
  const html = previewMetaLine([
    '---',
    'status: x" onmouseover="alert(1)',
    '---',
    '# Test',
  ].join('\n'))

  assert.equal(
    html,
    '<div class="doc-meta"><span class="doc-meta-status" data-status="x&quot; onmouseover=&quot;alert(1)">x&quot; onmouseover=&quot;alert(1)</span></div>',
  )
  assert.doesNotMatch(html, /"\s+onmouseover=/)
})
