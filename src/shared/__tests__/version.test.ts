import { test } from 'node:test'
import assert from 'node:assert/strict'

import { compareVersions, extractVersion, isVersionBelowMinimum } from '../version.ts'

test('extractVersion reads Oclif output and ignores build metadata', () => {
  assert.equal(extractVersion('@vosker/vdoc/1.6.0 darwin-arm64 node-v24.12.0'), '1.6.0')
  assert.equal(extractVersion('v2.3.4-beta.2+build.17'), '2.3.4-beta.2')
  assert.equal(extractVersion('not a version'), null)
})

test('compareVersions follows prerelease precedence', () => {
  assert.equal(compareVersions('1.6.0-beta.2', '1.6.0-beta.10'), -1)
  assert.equal(compareVersions('1.6.0-beta.10', '1.6.0'), -1)
  assert.equal(compareVersions('1.6.0', '1.6.0-beta.10'), 1)
  assert.equal(compareVersions('1.6.0+build.1', '1.6.0+build.2'), 0)
  assert.equal(compareVersions('invalid', '1.6.0'), null)
})

test('isVersionBelowMinimum compares Oclif output to the configured minimum', () => {
  assert.equal(isVersionBelowMinimum('@vosker/vdoc/1.5.9 darwin-arm64', '1.6.0'), true)
  assert.equal(isVersionBelowMinimum('@vosker/vdoc/1.6.0 darwin-arm64', '1.6.0'), false)
  assert.equal(isVersionBelowMinimum('@vosker/vdoc/1.7.0 darwin-arm64', '1.6.0'), false)
  assert.equal(isVersionBelowMinimum('unknown', '1.6.0'), false)
})
