import assert from 'node:assert/strict'
import { test } from 'node:test'

import { publishRelease, validateRelease } from '../release.mjs'

function fakeExecutor(outputs = {}) {
  const calls = []
  const remainingOutputs = Object.fromEntries(
    Object.entries(outputs).map(([label, output]) => [label, Array.isArray(output) ? [...output] : output])
  )
  const execute = (command, args, options = {}) => {
    const label = [command, ...args].join(' ')
    calls.push({ label, options })
    const output = remainingOutputs[label]
    return Array.isArray(output) ? (output.shift() ?? '') : (output ?? '')
  }
  return { calls, execute }
}

const validRepository = {
  'git branch --show-current': 'main',
  'git status --porcelain': '',
  'git rev-parse HEAD': 'release-sha',
  'git rev-parse refs/remotes/origin/main': 'release-sha'
}

test('validateRelease rejects a non-main branch before changing repository state', () => {
  const { calls, execute } = fakeExecutor({ 'git branch --show-current': 'feat/release' })

  assert.throws(() => validateRelease(execute), /Releases must run from main/)
  assert.deepEqual(calls.map(({ label }) => label), ['git branch --show-current'])
})

test('validateRelease rejects a dirty working tree before fetching', () => {
  const { calls, execute } = fakeExecutor({
    'git branch --show-current': 'main',
    'git status --porcelain': ' M package.json'
  })

  assert.throws(() => validateRelease(execute), /working tree must be clean/)
  assert.deepEqual(calls.map(({ label }) => label), [
    'git branch --show-current',
    'git status --porcelain'
  ])
})

test('publishRelease tests, rechecks, versions, and atomically pushes after validation', () => {
  const { calls, execute } = fakeExecutor(validRepository)

  publishRelease(execute)

  assert.deepEqual(calls.map(({ label }) => label).slice(-4), [
    'npm test',
    'git status --porcelain',
    'npm run bump',
    'git push --atomic --follow-tags origin main'
  ])
})

test('publishRelease stops if tests modify the working tree', () => {
  const { calls, execute } = fakeExecutor({
    ...validRepository,
    'git status --porcelain': ['', ' M generated.txt']
  })

  assert.throws(() => publishRelease(execute), /working tree must be clean/)
  assert.equal(calls.some(({ label }) => label === 'npm run release'), false)
})
