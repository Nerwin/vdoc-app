import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { relativeAppPath, resolveExistingPathInsideRoot, resolvePathInsideRoot } from '../path-policy.ts'

test('relativeAppPath accepts normalized app paths', () => {
  assert.equal(relativeAppPath('1-Backend/components/api.md'), '1-Backend/components/api.md')
})

test('relativeAppPath rejects paths outside the internal format', () => {
  for (const value of ['', '.', '../outside.md', 'docs/../outside.md', '/etc/passwd', 'C:/Windows/file', '\\\\server\\file', 'a\\b', 'a//b', 'a\0b']) {
    assert.throws(() => relativeAppPath(value), /Invalid path/)
  }
})

test('resolvePathInsideRoot keeps lexical paths under the root', () => {
  assert.equal(resolvePathInsideRoot('/repo', 'docs/file.md'), join('/repo', 'docs/file.md'))
})

test('resolveExistingPathInsideRoot refuses symlink escapes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vdoc-path-root-'))
  const outside = await mkdtemp(join(tmpdir(), 'vdoc-path-outside-'))
  try {
    await mkdir(join(root, 'docs'))
    await writeFile(join(root, 'docs', 'inside.md'), '# Inside')
    await writeFile(join(outside, 'outside.md'), '# Outside')
    await symlink(join(outside, 'outside.md'), join(root, 'docs', 'linked.md'))

    assert.equal(resolveExistingPathInsideRoot(root, 'docs/inside.md'), await realpath(join(root, 'docs', 'inside.md')))
    assert.throws(() => resolveExistingPathInsideRoot(root, 'docs/linked.md'), /Invalid path/)
  } finally {
    await Promise.all([rm(root, { recursive: true }), rm(outside, { recursive: true })])
  }
})
