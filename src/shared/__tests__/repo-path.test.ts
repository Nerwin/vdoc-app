import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fromCliPath, joinRepoPath, mappingKey, splitRepoPath, uniqueAlias } from '../repo-path.ts'

test('splitRepoPath takes the first segment as the alias', () => {
  assert.deepEqual(splitRepoPath('docs/1-Backend/api.md'), { alias: 'docs', rel: '1-Backend/api.md' })
  assert.deepEqual(splitRepoPath('docs'), { alias: 'docs', rel: '' })
})

test('splitRepoPath leaves malformed input to the alias guard', () => {
  assert.deepEqual(splitRepoPath(''), { alias: '', rel: '' })
  assert.deepEqual(splitRepoPath('docs/'), { alias: 'docs', rel: '' })
  assert.deepEqual(splitRepoPath('/docs/a.md'), { alias: '', rel: 'docs/a.md' })
})

test('joinRepoPath never emits a double or trailing slash', () => {
  assert.equal(joinRepoPath('docs', 'README.md'), 'docs/README.md')
  assert.equal(joinRepoPath('docs', ''), 'docs')
  assert.equal(joinRepoPath('docs', splitRepoPath('docs/a/b.md').rel), 'docs/a/b.md')
})

test('uniqueAlias suffixes duplicates with the next free number', () => {
  assert.equal(uniqueAlias('docs', []), 'docs')
  assert.equal(uniqueAlias('docs', ['docs']), 'docs-2')
  assert.equal(uniqueAlias('docs', ['docs', 'docs-2', 'docs-3']), 'docs-4')
  assert.equal(uniqueAlias('docs', ['docs', 'docs-3']), 'docs-2')
})

test('fromCliPath turns an echoed CLI path back into an app path', () => {
  assert.equal(fromCliPath('docs', './1-Backend/api.md'), 'docs/1-Backend/api.md')
  assert.equal(fromCliPath('docs', '1-Backend\\api.md'), 'docs/1-Backend/api.md')
  assert.equal(fromCliPath('docs', 'README.md'), 'docs/README.md')
})

test('mappingKey is the top-level folder inside the repository', () => {
  assert.equal(mappingKey('docs/1-Backend/components/api.md'), '1-Backend')
  assert.equal(mappingKey('docs/README.md'), 'README.md')
})
