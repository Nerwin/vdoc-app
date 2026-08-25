import assert from 'node:assert/strict'
import test from 'node:test'

import { quoteShellArg, shellCommand } from '../shell-command.ts'

test('POSIX commands quote whitespace, substitutions, and single quotes', () => {
  assert.equal(
    shellCommand(['vdoc', '--json', 'docs/my file.md', "it's.md", '$(whoami)', ';'], 'posix'),
    `vdoc --json 'docs/my file.md' 'it'"'"'s.md' '$(whoami)' ';'`,
  )
})

test('PowerShell commands quote metacharacters and escape single quotes', () => {
  assert.equal(
    shellCommand(['vdoc', '--json', 'docs/my file.md', "it's.md", '$(whoami)', ';'], 'powershell'),
    "vdoc --json 'docs/my file.md' 'it''s.md' '$(whoami)' ';'",
  )
})

test('empty shell arguments remain explicit', () => {
  assert.equal(quoteShellArg('', 'posix'), "''")
  assert.equal(quoteShellArg('', 'powershell'), "''")
})
