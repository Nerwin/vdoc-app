import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { diffLines, hunksOf, mergeSegments } from '../line-diff.ts'

describe('line diff', () => {
  const local = 'a\nb\nc\nd\ne\nf'
  const remote = 'a\nB\nc\nd\ne\nf\ng'

  it('groups changes into hunks with context and local line numbers', () => {
    const hunks = hunksOf(diffLines(local, remote))
    assert.equal(hunks.length, 2)
    assert.deepEqual(hunks[0].local, ['b'])
    assert.deepEqual(hunks[0].remote, ['B'])
    assert.equal(hunks[0].localStart, 2)
    assert.deepEqual(hunks[0].before, ['a'])
    assert.deepEqual(hunks[0].after, ['c', 'd'])
    assert.deepEqual(hunks[1].local, [])
    assert.deepEqual(hunks[1].remote, ['g'])
    assert.equal(hunks[1].localStart, 7)
  })

  it('merges per-hunk decisions and refuses undecided hunks', () => {
    const segments = diffLines(local, remote)
    assert.equal(mergeSegments(segments, new Map([[0, 'mine'], [1, 'theirs']])), 'a\nb\nc\nd\ne\nf\ng')
    assert.equal(mergeSegments(segments, new Map([[0, 'both'], [1, 'mine']])), 'a\nb\nB\nc\nd\ne\nf')
    assert.throws(() => mergeSegments(segments, new Map([[0, 'mine']])), /Hunk 2/)
  })

  it('round-trips identical and empty inputs', () => {
    assert.deepEqual(diffLines('x\ny', 'x\ny'), [{ kind: 'equal', lines: ['x', 'y'] }])
    assert.equal(hunksOf(diffLines('', '')).length, 0)
    assert.equal(mergeSegments(diffLines('', 'new'), new Map([[0, 'theirs']])), 'new')
  })
})
