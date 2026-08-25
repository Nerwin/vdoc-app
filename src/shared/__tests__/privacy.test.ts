import { test } from 'node:test'
import assert from 'node:assert/strict'

import { hidesVdocOutput, redactVdocArgs, scrubSentryEvent, vdocCommandId } from '../privacy.ts'

test('redactVdocArgs hides credentials and comment bodies', () => {
  assert.deepEqual(
    redactVdocArgs(['config', 'set', 'confluence.apiToken', '--encrypt', 'secret', '--json']),
    ['config', 'set', 'confluence.apiToken', '--encrypt', '•••', '--json'],
  )
  assert.deepEqual(
    redactVdocArgs(['cf', 'comment', 'docs/private.md', 'private comment', '--json']),
    ['cf', 'comment', 'docs/private.md', '•••', '--json'],
  )
})

test('vdoc privacy helpers identify safe command ids and sensitive output', () => {
  assert.equal(vdocCommandId(['cf', 'push', 'docs/private.md']), 'cf push')
  assert.equal(hidesVdocOutput(['config', 'get', 'confluence', '--decrypt']), true)
  assert.equal(hidesVdocOutput(['cf', 'comment', 'docs/private.md', 'body']), true)
  assert.equal(hidesVdocOutput(['cf', 'check', 'docs/private.md']), false)
})

test('scrubSentryEvent removes user content and file paths', () => {
  const scrubbed = scrubSentryEvent({
    message: 'failed for docs/private.md',
    breadcrumbs: [{ message: 'private comment' }],
    request: { url: 'https://company.atlassian.net/private' },
    user: { email: 'person@example.com' },
    extra: { token: 'secret' },
    exception: {
      values: [{
        type: 'Error',
        value: 'secret in /Users/person/docs/private.md',
        stacktrace: {
          frames: [{
            function: 'saveFile',
            filename: '/Users/person/docs/private.md',
            context_line: 'secret document content',
            lineno: 12,
          }],
        },
      }],
    },
  })

  const serialized = JSON.stringify(scrubbed)
  assert.doesNotMatch(serialized, /secret|private|person@example/)
  assert.match(serialized, /saveFile/)
  assert.match(serialized, /Application error/)
})
