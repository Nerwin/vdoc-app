import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { countStates, displayState, lastSyncAt, mergeChecks, needsAttention, scanEntry, syncGroup, type FileEntry } from '../status.ts'

describe('sync state model', () => {
  it('maps every CLI state to one of the five groups', () => {
    assert.equal(syncGroup('in-sync'), 'synced')
    assert.equal(syncGroup('behind'), 'remote')
    for (const state of ['ahead', 'local-edits', 'no-version'] as const) assert.equal(syncGroup(state), 'local')
    for (const state of ['conflict', 'not-found'] as const) assert.equal(syncGroup(state), 'conflict')
    for (const state of ['unverified', 'unchecked'] as const) assert.equal(syncGroup(state), 'unchecked')
    assert.equal(syncGroup('untracked'), 'unlinked')
  })

  it('never shows a version match without a baseline as synced', () => {
    const entry = { path: 'a.md', tracked: true, check: { file: 'a.md', state: 'in-sync' as const } }
    assert.equal(displayState(entry), 'unverified')
    assert.equal(displayState({ ...entry, check: { ...entry.check, localEdits: false } }), 'in-sync')
  })

  it('counts states without unlinked or Confluence-ignored documents', () => {
    const check = (state: 'behind' | 'conflict' | 'in-sync') => ({ file: 'x.md', state, localEdits: false })
    const counts = countStates([
      { path: 'a.md', tracked: true, check: check('behind') },
      { path: 'b.md', tracked: true, check: check('conflict') },
      { path: 'c.md', tracked: true, check: check('in-sync') },
      { path: 'd.md', tracked: true },
      { path: 'e.md', tracked: false },
      { path: 'f.md', tracked: true, ignored: true, check: check('behind') },
      { path: 'g.md', tracked: false, hidden: true },
    ])
    assert.deepEqual(counts, { files: 6, tracked: 5, attention: 2, synced: 1, local: 0, remote: 1, conflict: 1, unchecked: 1 })
  })

  it('attention is the sum of the actionable groups only', () => {
    assert.ok(needsAttention('behind'))
    assert.ok(needsAttention('conflict'))
    assert.ok(!needsAttention('unverified'))
    assert.ok(!needsAttention('in-sync'))
  })
})

describe('lastSyncAt', () => {
  const check = { file: 'a.md', state: 'in-sync' as const, localVersion: 8, remoteVersion: 8 }
  const v8 = { number: 8, createdAt: '2026-09-21T12:31:00Z', author: 'M. Tremblay' }

  it('uses the publish date of the Confluence version the file is at', () => {
    assert.equal(lastSyncAt(check, v8, undefined), Date.parse(v8.createdAt))
  })

  it('ignores a newer remote version the file has not pulled', () => {
    assert.equal(lastSyncAt({ ...check, state: 'behind', remoteVersion: 9 }, { ...v8, number: 9 }, undefined), undefined)
  })

  it('prefers a more recent app push or pull', () => {
    const pulled = Date.parse('2026-09-23T08:00:00Z')
    assert.equal(lastSyncAt(check, v8, pulled), pulled)
    assert.equal(lastSyncAt(undefined, null, pulled), pulled)
  })
})

describe('check merging', () => {
  const entries = (): Map<string, FileEntry> => new Map([['docs/a.md', { path: 'docs/a.md', tracked: true }]])

  it('stamps fresh results now and keeps the stamp of restored ones', () => {
    const fresh = mergeChecks(entries(), [{ file: './docs/a.md', state: 'behind', checkedAt: 5 }], true, 100)
    assert.equal(fresh.get('docs/a.md')?.checkedAt, 100)
    assert.equal(fresh.get('docs/a.md')?.check?.state, 'behind')
    const restored = mergeChecks(entries(), [{ file: 'docs/a.md', state: 'behind', checkedAt: 5 }], false, 100)
    assert.equal(restored.get('docs/a.md')?.checkedAt, 5)
  })

  it('drops results for files the tree does not list', () => {
    const merged = mergeChecks(entries(), [{ file: 'docs/gone.md', state: 'in-sync', localEdits: false }], true, 100)
    assert.deepEqual([...merged.keys()], ['docs/a.md'])
  })

  it('keeps a check across rescans only while the file stays tracked', () => {
    const previous: FileEntry = { path: 'docs/a.md', tracked: true, check: { file: 'docs/a.md', state: 'in-sync', localEdits: false }, checkedAt: 7 }
    const scanned = { path: 'docs/a.md', tracked: true, gitDirty: false }
    assert.equal(scanEntry(scanned, previous).check?.state, 'in-sync')
    assert.equal(scanEntry({ ...scanned, tracked: false }, previous).check, undefined)
    assert.equal(scanEntry(scanned, undefined).check, undefined)
  })
})
