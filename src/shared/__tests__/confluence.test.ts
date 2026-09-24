import assert from 'node:assert/strict'
import { test } from 'node:test'

import { displayAuthor, parseConfluenceSpaces } from '../confluence.ts'

test('parseConfluenceSpaces keeps the displayed fields in CLI order', () => {
  assert.deepEqual(parseConfluenceSpaces([
    { id: '2511667313', key: '~713272010', name: 'Xavier Cote', extra: true },
    { id: '3271393311', key: 'PMRD', name: 'Project Management (R&D)' },
  ]), [
    { id: '2511667313', key: '~713272010', name: 'Xavier Cote' },
    { id: '3271393311', key: 'PMRD', name: 'Project Management (R&D)' },
  ])
})

test('parseConfluenceSpaces ignores malformed CLI entries', () => {
  assert.deepEqual(parseConfluenceSpaces([
    null,
    { id: 123, key: 'DOC', name: 'Docs' },
    { id: '123', key: 'DOC' },
  ]), [])
  assert.deepEqual(parseConfluenceSpaces(undefined), [])
})

test('displayAuthor softens raw account ids and keeps mapped names', () => {
  assert.equal(displayAuthor('M. Tremblay'), 'M. Tremblay')
  assert.equal(displayAuthor('557058:0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d'), 'unmapped user')
})
