import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseFrontmatter, setConfluenceIgnore } from '../frontmatter.ts'

test('parseFrontmatter reads scalars, quoted values, and inline tag lists', () => {
  const md = [
    '---',
    'title: "BE: 9.1 EDA Guidelines and Best Practices"',
    'type: arc42-section',
    'status: DONE',
    'updated: 2026-01-01',
    'tags: [guidelines, eda, kafka]',
    'confluencePageId: "5697306635"',
    'confluenceIgnore: true',
    '---',
    '',
    '# BE: 9.1 EDA Guidelines and Best Practices',
  ].join('\n')

  assert.deepEqual(parseFrontmatter(md), {
    title: 'BE: 9.1 EDA Guidelines and Best Practices',
    status: 'DONE',
    updated: '2026-01-01',
    tags: ['guidelines', 'eda', 'kafka'],
    confluencePageId: '5697306635',
    confluenceIgnore: true,
  })
})

test('parseFrontmatter tolerates missing frontmatter and missing keys', () => {
  assert.deepEqual(parseFrontmatter('# Just a doc\n\nBody.'), {})
  assert.deepEqual(parseFrontmatter('---\ntitle: Solo\n---\n'), {
    title: 'Solo',
    status: undefined,
    updated: undefined,
    tags: undefined,
    confluencePageId: undefined,
    confluenceIgnore: undefined,
  })
})

test('parseFrontmatter only reads confluenceIgnore: true as ignored', () => {
  assert.equal(parseFrontmatter('---\nconfluenceIgnore: false\n---\n').confluenceIgnore, undefined)
  assert.equal(parseFrontmatter('---\nconfluenceIgnore: yes\n---\n').confluenceIgnore, undefined)
})

test('parseFrontmatter only reads the leading block and ignores nested yaml', () => {
  const md = '---\ntitle: First\nmetadata:\n  nested: true\n---\n\n---\ntitle: Second\n---\n'
  const result = parseFrontmatter(md)
  assert.equal(result.title, 'First')
})

test('setConfluenceIgnore inserts into an existing block without touching other keys', () => {
  const md = '---\ntitle: Doc\nconfluencePageId: "123"\n---\n\n# Doc\n'
  assert.equal(
    setConfluenceIgnore(md, true),
    '---\ntitle: Doc\nconfluencePageId: "123"\nconfluenceIgnore: true\n---\n\n# Doc\n',
  )
})

test('setConfluenceIgnore replaces an existing value', () => {
  const md = '---\nconfluenceIgnore: true\ntitle: Doc\n---\nBody\n'
  assert.equal(setConfluenceIgnore(md, false), '---\nconfluenceIgnore: false\ntitle: Doc\n---\nBody\n')
})

test('setConfluenceIgnore creates the block when the file has none', () => {
  assert.equal(setConfluenceIgnore('# Doc\n', true), '---\nconfluenceIgnore: true\n---\n\n# Doc\n')
})

test('setConfluenceIgnore keeps CRLF line endings', () => {
  const md = '---\r\ntitle: Doc\r\n---\r\nBody\r\n'
  assert.equal(setConfluenceIgnore(md, true), '---\r\ntitle: Doc\r\nconfluenceIgnore: true\r\n---\r\nBody\r\n')
})
