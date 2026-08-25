import assert from 'node:assert/strict'
import test from 'node:test'

import { GuardedSaveQueue } from '../save-queue.ts'
import type { FileWriteRequest } from '../types.ts'

test('save queue serializes an edit queued while a save is active', async () => {
  const writes: FileWriteRequest[] = []
  let releaseFirst: (() => void) | undefined
  const firstWrite = new Promise<void>(resolve => {
    releaseFirst = resolve
  })
  const queue = new GuardedSaveQueue(async request => {
    writes.push(request)
    if (writes.length === 1) await firstWrite
    return { revision: request.revision }
  })

  queue.setDisk('Docs/page.md', '# Old\n')
  queue.queue('Docs/page.md', '# First\n')
  const flushing = queue.flush()
  await Promise.resolve()
  queue.queue('Docs/page.md', '# Second\n')
  releaseFirst?.()

  assert.deepEqual(await flushing, { saved: true, failures: [] })
  assert.deepEqual(writes.map(({ expected, next }) => ({ expected, next })), [
    { expected: '# Old\n', next: '# First\n' },
    { expected: '# First\n', next: '# Second\n' },
  ])
})

test('save queue retains the latest draft after a failed write', async () => {
  let attempt = 0
  const queue = new GuardedSaveQueue(async request => {
    if (++attempt === 1) throw new Error('disk changed')
    return { revision: request.revision }
  })

  queue.setDisk('Docs/page.md', '# Old\n')
  queue.queue('Docs/page.md', '# Draft\n')

  const failed = await queue.flush()
  assert.equal(failed.saved, false)
  assert.equal(failed.failures.length, 1)
  assert.equal(queue.draft('Docs/page.md'), '# Draft\n')

  assert.deepEqual(await queue.flush(), { saved: true, failures: [] })
  assert.equal(queue.hasPending(), false)
})

test('save queue continues with other files after one path fails', async () => {
  const written: string[] = []
  const queue = new GuardedSaveQueue(async request => {
    if (request.path.endsWith('bad.md')) throw new Error('blocked')
    written.push(request.path)
    return { revision: request.revision }
  })

  queue.setDisk('Docs/bad.md', 'old')
  queue.setDisk('Docs/good.md', 'old')
  queue.queue('Docs/bad.md', 'draft')
  queue.queue('Docs/good.md', 'draft')

  const result = await queue.flush()
  assert.equal(result.saved, false)
  assert.deepEqual(result.failures.map(failure => failure.path), ['Docs/bad.md'])
  assert.deepEqual(written, ['Docs/good.md'])
})
