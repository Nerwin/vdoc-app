import assert from 'node:assert/strict'
import test from 'node:test'

import type { DiffResult } from '../types.ts'
import { verifyBatch } from '../verification.ts'

const diff = (baselineRecorded: boolean): DiffResult => ({
  pageId: '123',
  file: 'Docs/page.md',
  identical: baselineRecorded,
  patch: '',
  local: '',
  remote: '',
  remoteVersion: 1,
  versionDrift: false,
  baselineRecorded,
})

test('verifyBatch keeps content differences separate from command failures', async () => {
  const progress: string[] = []
  const result = await verifyBatch(
    ['Docs/same.md', 'Docs/different.md', 'Docs/failed.md'],
    path => {
      if (path.endsWith('failed.md')) return Promise.reject(new Error('offline'))
      return Promise.resolve(diff(path.endsWith('same.md')))
    },
    (done, total) => progress.push(`${done}/${total}`),
  )

  assert.deepEqual(result.verified, ['Docs/same.md'])
  assert.deepEqual(result.different, ['Docs/different.md'])
  assert.deepEqual(result.failed.map(failure => failure.path), ['Docs/failed.md'])
  assert.deepEqual(progress, ['1/3', '2/3', '3/3'])
})
