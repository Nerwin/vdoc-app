import { test } from 'node:test'
import assert from 'node:assert/strict'

import { escapeHtml, previewBody, renderPreview, withSourceLine } from '../preview-html.ts'

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

test('renderPreview escapes raw HTML in blocks, inline, tables and quotes', () => {
  const html = renderPreview([
    '<script>alert(1)</script>',
    '',
    'Text <img src=x onerror=alert(1)> inline',
    '',
    '| a |',
    '| - |',
    '| <b onclick=x>b</b> |',
    '',
    '> <iframe src="https://example.com"></iframe>',
  ].join('\n'), 'docs/a.md')
  assert.doesNotMatch(html, /<script|<img|<b |<iframe/)
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
})

test('renderPreview tags each block with its source line, after the frontmatter', () => {
  const html = renderPreview('---\ntitle: T\n---\n# Title\n\nPara one\nstill one\n\n- item\n', 'docs/a.md')
  assert.match(html, /<h1 data-line="4"/)
  assert.match(html, /<p data-line="6">Para one/)
  assert.match(html, /<ul data-line="9"/)
})

test('renderPreview escapes fenced code and keeps mermaid source for the diagram pass', () => {
  const html = renderPreview('```ts\nconst a = "<b>"\n```\n\n```mermaid\ngraph TD; A-->B\n```\n', 'docs/a.md')
  assert.match(html, /<pre data-line="1" class="code-block" data-lang="typescript"><code>const a = &quot;&lt;b&gt;&quot;/)
  assert.match(html, /<pre data-line="5" class="mermaid-source">graph TD; A--&gt;B/)
})
