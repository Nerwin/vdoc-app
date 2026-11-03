import assert from 'node:assert/strict'
import test from 'node:test'

import type { CommentEntry } from '../types.ts'
import { commentThreads } from '../comments.ts'

const entry = (id: string, parentId?: string): CommentEntry => ({
  id,
  kind: 'footer',
  author: 'Author',
  authorId: 'author-id',
  createdAt: '2026-11-03T10:00:00Z',
  markdown: `comment ${id}`,
  ...(parentId && { parentId }),
})

const ids = (threads: ReturnType<typeof commentThreads>): unknown =>
  threads.map(thread => [thread.comment.id, ids(thread.replies)])

test('commentThreads nests replies at any depth in CLI order', () => {
  const threads = commentThreads([entry('1'), entry('2', '1'), entry('3', '2'), entry('4', '1'), entry('5')])
  assert.deepEqual(ids(threads), [['1', [['2', [['3', []]]], ['4', []]]], ['5', []]])
})

test('commentThreads does not depend on parents being listed first', () => {
  assert.deepEqual(ids(commentThreads([entry('2', '1'), entry('1')])), [['1', [['2', []]]]])
})

test('commentThreads keeps a reply whose parent is missing as a root', () => {
  assert.deepEqual(ids(commentThreads([entry('1'), entry('2', 'gone')])), [['1', []], ['2', []]])
})
