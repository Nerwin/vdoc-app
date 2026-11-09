import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseGitStatus } from '../git-status.ts'

test('parseGitStatus keeps non-ASCII and spaced paths as they are', () => {
  const output = ' M docs/Réunion équipe.md\0?? docs/new.md\0'
  assert.deepEqual(parseGitStatus(output, ''), new Set(['docs/Réunion équipe.md', 'docs/new.md']))
})

test('parseGitStatus keeps the new path of a rename', () => {
  const output = 'R  docs/b.md\0docs/a.md\0 M docs/c.md\0'
  assert.deepEqual(parseGitStatus(output, ''), new Set(['docs/b.md', 'docs/c.md']))
})

test('parseGitStatus makes paths relative to a docs root inside the repo', () => {
  const output = ' M site/docs/a.md\0 M README.md\0'
  assert.deepEqual(parseGitStatus(output, 'site/'), new Set(['docs/a.md']))
})

test('parseGitStatus returns nothing for a clean tree', () => {
  assert.deepEqual(parseGitStatus('', ''), new Set())
})
