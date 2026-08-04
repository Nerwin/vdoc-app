import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fuzzyRank, fuzzyScore } from '../fuzzy.ts'

test('fuzzyScore ranks basename over path over subsequence', () => {
  const inName = fuzzyScore('auth', '1-Backend/be-authentication.md')!
  const inPath = fuzzyScore('backend', '1-Backend/be-authentication.md')!
  const subsequence = fuzzyScore('bauth', '1-Backend/be-authentication.md')!
  assert.ok(inName < inPath, 'basename match beats path match')
  assert.ok(inPath < subsequence, 'path match beats subsequence')
  assert.equal(fuzzyScore('zzz', '1-Backend/be-authentication.md'), null)
  assert.equal(fuzzyScore('', 'anything.md'), 0)
})

test('fuzzyRank orders and caps results', () => {
  const paths = ['4-Notes/guide.md', '1-Backend/auth.md', '2-DDA/adr/auth-decision.md']
  assert.deepEqual(fuzzyRank('auth', paths, 10), ['1-Backend/auth.md', '2-DDA/adr/auth-decision.md'])
  assert.equal(fuzzyRank('a', paths, 2).length, 2)
})
