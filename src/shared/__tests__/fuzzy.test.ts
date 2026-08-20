import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fuzzyMatch, fuzzyRank } from '../fuzzy.ts'

test('fuzzyMatch ranks basename over path over subsequence, with highlight indices', () => {
  const inName = fuzzyMatch('auth', 'docs/be-authentication.md')!
  const inPath = fuzzyMatch('docs', 'docs/be-authentication.md')!
  const subsequence = fuzzyMatch('bauth', 'docs/be-authentication.md')!
  assert.ok(inName.score < inPath.score, 'basename match beats path match')
  assert.ok(inPath.score < subsequence.score, 'path match beats subsequence')
  assert.deepEqual(inName.indices, [8, 9, 10, 11], 'indices point into the full text')
  assert.equal(subsequence.indices.length, 5)
  assert.equal(fuzzyMatch('zzz', 'docs/be-authentication.md'), null)
  assert.deepEqual(fuzzyMatch('', 'anything.md'), { score: 0, indices: [] })
})

test('fuzzyRank orders and caps results', () => {
  const paths = ['notes/guide.md', 'api/auth.md', 'zzz/auth-decision.md']
  assert.deepEqual(fuzzyRank('auth', paths, 10), ['api/auth.md', 'zzz/auth-decision.md'])
  assert.equal(fuzzyRank('u', paths, 2).length, 2)
})
