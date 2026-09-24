import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { cliStatus, detectFormat, documentOf, interpretCli, worstOutcome } from '../cli-status.ts'

describe('cliStatus', () => {
  it('reads the status field before the exit code', () => {
    assert.equal(cliStatus({ exitCode: 3, stdout: '{"status":"success"}' }).outcome, 'success')
    assert.equal(cliStatus({ exitCode: 0, stdout: '{"status":"warning","message":"stale"}' }).summary, 'Warning - stale')
    assert.equal(cliStatus({ exitCode: 0, stdout: '{"status":"error"}' }).outcome, 'error')
  })

  it('treats result fields and non-zero exits as findings, never errors', () => {
    assert.deepEqual(cliStatus({ exitCode: 3, stdout: '{"result":"differences-found","files":[]}' }), { outcome: 'findings', summary: 'Findings - differences found' })
    assert.deepEqual(cliStatus({ exitCode: 2, stdout: '{"status":"findings","result":"lint-errors","files":[]}' }), { outcome: 'findings', summary: 'Findings - lint errors' })
    assert.equal(cliStatus({ exitCode: 1, stdout: 'not json' }).outcome, 'findings')
    assert.equal(cliStatus({ exitCode: 0, stdout: '' }).outcome, 'success')
  })

  it('flags oclif error payloads and spawn failures as errors', () => {
    const oclif = cliStatus({ exitCode: 2, stdout: '{"error":{"name":"ValidationError","message":"unsupported block","code":"VALIDATION_ERROR"}}' })
    assert.equal(oclif.outcome, 'error')
    assert.equal(oclif.summary, 'Error - validation error: unsupported block')
    assert.equal(cliStatus({ exitCode: 1, stdout: '{"stack":"x","message":"boom"}' }).summary, 'Error - boom')
    assert.equal(cliStatus({ exitCode: -1, stdout: '' }).outcome, 'error')
    assert.equal(cliStatus({ exitCode: 124, stdout: '', termination: 'timeout' }).outcome, 'error')
    assert.equal(cliStatus({ exitCode: 130, stdout: '', termination: 'cancelled' }).outcome, 'warning')
  })

  it('ranks outcomes and detects json output', () => {
    assert.equal(worstOutcome(['success', 'findings', 'warning']), 'warning')
    assert.equal(worstOutcome([]), 'success')
    assert.equal(detectFormat('{"a":1}'), 'json')
    assert.equal(detectFormat('[1]'), 'json')
    assert.equal(detectFormat('plain'), 'text')
  })

  it('interprets findings per command and finds the document argument', () => {
    const entry = { args: ['cf', 'diff', 'docs/a.md'], exitCode: 3, stdout: '' }
    assert.match(interpretCli(entry, cliStatus(entry)) ?? '', /Review the diff/)
    assert.equal(interpretCli({ ...entry, exitCode: 0 }, cliStatus({ ...entry, exitCode: 0 })), null)
    assert.equal(documentOf(['cf', 'check', './docs/a.md', 'docs/b.md'], path => path === 'docs/b.md'), 'docs/b.md')
    assert.equal(documentOf(['config', 'path'], () => true), null)
  })
})
