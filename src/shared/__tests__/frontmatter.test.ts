import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseFrontmatter } from '../frontmatter.ts'

test('parseFrontmatter reads scalars, quoted values, and inline tag lists', () => {
  const md = [
    '---',
    'title: "BE: 9.1 EDA Guidelines and Best Practices"',
    'type: arc42-section',
    'status: DONE',
    'updated: 2026-01-01',
    'tags: [guidelines, eda, kafka]',
    '---',
    '',
    '# BE: 9.1 EDA Guidelines and Best Practices',
  ].join('\n')

  assert.deepEqual(parseFrontmatter(md), {
    title: 'BE: 9.1 EDA Guidelines and Best Practices',
    status: 'DONE',
    updated: '2026-01-01',
    tags: ['guidelines', 'eda', 'kafka'],
  })
})

test('parseFrontmatter tolerates missing frontmatter and missing keys', () => {
  assert.deepEqual(parseFrontmatter('# Just a doc\n\nBody.'), {})
  assert.deepEqual(parseFrontmatter('---\ntitle: Solo\n---\n'), {
    title: 'Solo',
    status: undefined,
    updated: undefined,
    tags: undefined,
  })
})

test('parseFrontmatter only reads the leading block and ignores nested yaml', () => {
  const md = '---\ntitle: First\nmetadata:\n  nested: true\n---\n\n---\ntitle: Second\n---\n'
  const result = parseFrontmatter(md)
  assert.equal(result.title, 'First')
})
