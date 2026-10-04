import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { reviewOutcome, spliceMerged } from '../review.ts'

describe('review outcome', () => {
  it('tells an untouched, a fully reverted and a mixed review apart', () => {
    assert.equal(reviewOutcome('a\nB', 'a\nb', 'a\nB'), 'theirs')
    assert.equal(reviewOutcome('a\nb', 'a\nb', 'a\nB'), 'mine')
    assert.equal(reviewOutcome('a\nb\nC', 'a\nb\nc', 'a\nB\nC'), 'merged')
  })

  it('ignores line-ending differences', () => {
    assert.equal(reviewOutcome('a\r\nB', 'a\nb', 'a\nB'), 'theirs')
  })
})

describe('splice merged', () => {
  it('replaces the whole file when the diff body is the file', () => {
    assert.equal(spliceMerged('a\nb', 'a\nb', 'a\nB'), 'a\nB')
  })

  it('keeps the frontmatter around a body-only diff', () => {
    assert.equal(spliceMerged('---\nx: 1\n---\nbody', 'body', 'BODY'), '---\nx: 1\n---\nBODY')
  })

  it('matches in LF and writes back in the file\'s CRLF endings', () => {
    assert.equal(spliceMerged('---\r\nx: 1\r\n---\r\na\r\nb', 'a\nb', 'a\nB'), '---\r\nx: 1\r\n---\r\na\r\nB')
  })

  it('refuses a body that is missing or ambiguous on disk', () => {
    assert.throws(() => spliceMerged('other', 'body', 'BODY'), /does not map back/)
    assert.throws(() => spliceMerged('body\nbody', 'body', 'BODY'), /does not map back/)
  })
})
