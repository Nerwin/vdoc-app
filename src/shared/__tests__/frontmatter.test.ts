import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseFrontmatter, setFrontmatterFlag } from '../frontmatter.ts'

test('parseFrontmatter reads scalars, quoted values, and inline tag lists', () => {
  const md = [
    '---',
    'title: "BE: 9.1 EDA Guidelines and Best Practices"',
    'type: arc42-section',
    'status: DONE',
    'updated: 2026-01-01',
    'tags: [guidelines, eda, kafka]',
    'confluencePageId: "5697306635"',
    'confluenceSpace: BACK',
    'confluencePageVersion: 42',
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
    confluenceSpace: 'BACK',
    confluencePageVersion: 42,
    confluenceIgnore: true,
    vdocHide: undefined,
    vdocPin: undefined,
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
    confluenceSpace: undefined,
    confluencePageVersion: undefined,
    confluenceIgnore: undefined,
    vdocHide: undefined,
    vdocPin: undefined,
  })
})

test('parseFrontmatter only reads confluenceIgnore: true as ignored', () => {
  assert.equal(parseFrontmatter('---\nconfluenceIgnore: false\n---\n').confluenceIgnore, undefined)
  assert.equal(parseFrontmatter('---\nconfluenceIgnore: yes\n---\n').confluenceIgnore, undefined)
})

test('parseFrontmatter reads vdocHide and vdocPin only as true', () => {
  const result = parseFrontmatter('---\nvdocHide: true\nvdocPin: true\n---\n')
  assert.equal(result.vdocHide, true)
  assert.equal(result.vdocPin, true)
  assert.equal(parseFrontmatter('---\nvdocHide: false\nvdocPin: yes\n---\n').vdocHide, undefined)
  assert.equal(parseFrontmatter('---\nvdocHide: false\nvdocPin: yes\n---\n').vdocPin, undefined)
})

test('parseFrontmatter rejects malformed versions, lists, and closing delimiters', () => {
  assert.equal(parseFrontmatter('---\nconfluencePageVersion: 0\n---\n').confluencePageVersion, undefined)
  assert.equal(parseFrontmatter('---\nconfluencePageVersion: "4"\n---\n').confluencePageVersion, undefined)
  assert.equal(parseFrontmatter('---\ntags: [one, two\n---\n').tags, undefined)
  assert.deepEqual(parseFrontmatter('---\ntitle: Doc\n---oops\nBody\n'), {})
})

test('parseFrontmatter only reads the leading block and ignores nested yaml', () => {
  const md = '---\ntitle: First\nmetadata:\n  nested: true\n---\n\n---\ntitle: Second\n---\n'
  const result = parseFrontmatter(md)
  assert.equal(result.title, 'First')
})

test('setFrontmatterFlag inserts into an existing block without touching other keys', () => {
  const md = '---\ntitle: Doc\nconfluencePageId: "123"\n---\n\n# Doc\n'
  assert.equal(
    setFrontmatterFlag(md, 'confluenceIgnore', true),
    '---\ntitle: Doc\nconfluencePageId: "123"\nconfluenceIgnore: true\n---\n\n# Doc\n',
  )
})

test('setFrontmatterFlag replaces an existing value', () => {
  const md = '---\nconfluenceIgnore: true\ntitle: Doc\n---\nBody\n'
  assert.equal(setFrontmatterFlag(md, 'confluenceIgnore', false), '---\nconfluenceIgnore: false\ntitle: Doc\n---\nBody\n')
})

test('setFrontmatterFlag removes duplicate values', () => {
  const md = '---\nconfluenceIgnore: false\ntitle: Doc\nconfluenceIgnore: true\n---\nBody\n'
  assert.equal(setFrontmatterFlag(md, 'confluenceIgnore', false), '---\nconfluenceIgnore: false\ntitle: Doc\n---\nBody\n')
  assert.equal(parseFrontmatter(setFrontmatterFlag(md, 'confluenceIgnore', false)).confluenceIgnore, undefined)
})

test('setFrontmatterFlag handles an empty frontmatter block', () => {
  assert.equal(setFrontmatterFlag('---\n---\nBody\n', 'confluenceIgnore', true), '---\nconfluenceIgnore: true\n---\nBody\n')
})

test('setFrontmatterFlag creates the block when the file has none', () => {
  assert.equal(setFrontmatterFlag('# Doc\n', 'confluenceIgnore', true), '---\nconfluenceIgnore: true\n---\n\n# Doc\n')
})

test('setFrontmatterFlag keeps CRLF line endings', () => {
  const md = '---\r\ntitle: Doc\r\n---\r\nBody\r\n'
  assert.equal(setFrontmatterFlag(md, 'confluenceIgnore', true), '---\r\ntitle: Doc\r\nconfluenceIgnore: true\r\n---\r\nBody\r\n')
})

test('setFrontmatterFlag toggles vdocPin independently of other flags', () => {
  const md = '---\ntitle: Doc\nconfluenceIgnore: true\n---\nBody\n'
  const pinned = setFrontmatterFlag(md, 'vdocPin', true)
  assert.equal(pinned, '---\ntitle: Doc\nconfluenceIgnore: true\nvdocPin: true\n---\nBody\n')
  assert.equal(setFrontmatterFlag(pinned, 'vdocPin', false), '---\ntitle: Doc\nconfluenceIgnore: true\nvdocPin: false\n---\nBody\n')
})
