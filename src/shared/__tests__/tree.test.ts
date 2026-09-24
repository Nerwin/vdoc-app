import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildTree, flattenVisible, filesUnder, orderPinnedFirst, pinnedGroupEnds } from '../tree.ts'
import { displayState } from '../status.ts'

test('buildTree nests files under their directories', () => {
  const tree = buildTree([
    '1-Backend/components/api.md',
    '1-Backend/intro.md',
    '4-Notes/Guides/vdoc.md',
  ])

  assert.equal(tree.length, 2)
  const backend = tree[0]
  assert.ok(backend.kind === 'dir' && backend.name === '1-Backend')
  assert.deepEqual(
    backend.children.map(node => [node.kind, node.name]),
    [['dir', 'components'], ['file', 'intro.md']],
  )
  assert.deepEqual(filesUnder(backend).sort(), ['1-Backend/components/api.md', '1-Backend/intro.md'])
})

test('buildTree puts dirs before files at every depth', () => {
  const tree = buildTree(['a.md', 'b/nested.md', 'b/z/deep.md', 'c.md'])
  assert.deepEqual(tree.map(node => [node.kind, node.name]), [['dir', 'b'], ['file', 'a.md'], ['file', 'c.md']])
  const b = tree[0]
  assert.ok(b.kind === 'dir')
  assert.deepEqual(b.children.map(node => [node.kind, node.name]), [['dir', 'z'], ['file', 'nested.md']])
})

test('flattenVisible hides children of collapsed dirs', () => {
  const tree = buildTree(['a/b/one.md', 'a/two.md', 'c/three.md'])

  const all = flattenVisible(tree, new Set())
  assert.deepEqual(all.map(node => node.path), ['a', 'a/b', 'a/b/one.md', 'a/two.md', 'c', 'c/three.md'])

  const collapsed = flattenVisible(tree, new Set(['a/b']))
  assert.deepEqual(collapsed.map(node => node.path), ['a', 'a/b', 'a/two.md', 'c', 'c/three.md'])
})

test('orderPinnedFirst hoists pinned dirs at every depth, stable otherwise', () => {
  const tree = buildTree(['a/x.md', 'b/deep/y.md', 'b/first.md', 'c/z.md'])

  const ordered = orderPinnedFirst(tree, ['c', 'b/deep'])
  assert.deepEqual(ordered.map(node => node.path), ['c', 'a', 'b'])
  const b = ordered[2]
  assert.ok(b.kind === 'dir')
  assert.deepEqual(b.children.map(node => node.path), ['b/deep', 'b/first.md'])

  assert.deepEqual(orderPinnedFirst(tree, []).map(node => node.path), ['a', 'b', 'c'])
})

test('orderPinnedFirst keeps pinned files below dirs, above their file siblings', () => {
  const tree = buildTree(['a/x.md', 'first.md', 'second.md', 'third.md'])

  const ordered = orderPinnedFirst(tree, ['third.md'])
  assert.deepEqual(ordered.map(node => node.path), ['a', 'third.md', 'first.md', 'second.md'])
})

test('orderPinnedFirst keeps pinned files in pin order, not name order', () => {
  const tree = buildTree(['a.md', 'b.md', 'c.md', 'd.md'])
  assert.deepEqual(orderPinnedFirst(tree, ['c.md', 'a.md']).map(node => node.path), ['c.md', 'a.md', 'b.md', 'd.md'])
})

test('pinnedGroupEnds marks the last pinned file before the rest of its folder', () => {
  const pins = ['x/b.md', 'x/a.md', 'y/only.md']
  const rows = flattenVisible(orderPinnedFirst(buildTree(['x/a.md', 'x/b.md', 'x/c.md', 'y/only.md', 'z.md']), pins), new Set())
  assert.deepEqual([...pinnedGroupEnds(rows, new Set(pins))], ['x/a.md'])
})

test('displayState refuses to show green without a local-edit baseline', () => {
  const base = { path: 'x.md', tracked: true }
  assert.equal(displayState({ path: 'x.md', tracked: false }), 'untracked')
  assert.equal(displayState(base), 'unchecked')
  assert.equal(displayState({ ...base, check: { file: 'x.md', state: 'in-sync' } }), 'unverified')
  assert.equal(displayState({ ...base, check: { file: 'x.md', state: 'in-sync', localEdits: false } }), 'in-sync')
  assert.equal(displayState({ ...base, check: { file: 'x.md', state: 'conflict', localEdits: true } }), 'conflict')
})
