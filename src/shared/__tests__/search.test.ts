import { test } from 'node:test'
import assert from 'node:assert/strict'

import { firstMatch } from '../search.ts'

test('firstMatch finds the first matching line, case-insensitive', () => {
  const text = '# Title\n\nSome Kafka notes\nmore kafka here'
  assert.deepEqual(firstMatch(text, 'kafka'), { line: 3, snippet: 'Some Kafka notes' })
  assert.deepEqual(firstMatch(text, 'KAFKA'), { line: 3, snippet: 'Some Kafka notes' })
})

test('firstMatch trims and clips the snippet', () => {
  const long = `   ${'x'.repeat(300)}match`
  assert.equal(firstMatch(long, 'match')?.snippet.length, 200)
  assert.equal(firstMatch('  indented hit  ', 'hit')?.snippet, 'indented hit')
})

test('firstMatch returns null for no match or blank query', () => {
  assert.equal(firstMatch('nothing here', 'kafka'), null)
  assert.equal(firstMatch('anything', ''), null)
})
