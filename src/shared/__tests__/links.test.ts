import { test } from 'node:test'
import assert from 'node:assert/strict'

import { mdLinkTargets, resolveRelative } from '../links.ts'

test('mdLinkTargets extracts .md targets and strips fragments', () => {
  const md = [
    'See [intro](../0-Intro/intro.md) and [api](./api.md#auth).',
    'External [site](https://example.com/page.md) still matches by shape.',
    'Not a doc: [img](../0-Images/pic.png) and [page](https://example.com).',
  ].join('\n')

  assert.deepEqual(mdLinkTargets(md), ['../0-Intro/intro.md', './api.md', 'https://example.com/page.md'])
})

test('resolveRelative resolves ./ and ../ against the linking file', () => {
  assert.equal(resolveRelative('1-Backend/components/api.md', './auth.md'), '1-Backend/components/auth.md')
  assert.equal(resolveRelative('1-Backend/components/api.md', '../intro.md'), '1-Backend/intro.md')
  assert.equal(resolveRelative('1-Backend/intro.md', 'sub/deep.md'), '1-Backend/sub/deep.md')
  assert.equal(resolveRelative('1-Backend/api.md', './auth.md#section'), '1-Backend/auth.md')
})

test('resolveRelative refuses absolutes, schemes, and root escapes', () => {
  assert.equal(resolveRelative('1-Backend/api.md', 'https://example.com/x.md'), null)
  assert.equal(resolveRelative('1-Backend/api.md', 'mailto:x@y.z'), null)
  assert.equal(resolveRelative('1-Backend/api.md', '/etc/passwd'), null)
  assert.equal(resolveRelative('1-Backend/api.md', '../../outside.md'), null)
})
