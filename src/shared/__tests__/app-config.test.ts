import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { parseVdocCliRequirement } from '../app-config.ts'

const PACKAGE_JSON = JSON.parse(readFileSync(join(import.meta.dirname, '../../../package.json'), 'utf8')) as Record<string, unknown>

test('parseVdocCliRequirement accepts the release metadata', () => {
  assert.deepEqual(parseVdocCliRequirement({
    vdocCli: {
      minimumVersion: 'v1.6.0',
      updateCommand: ' bun install -g @vosker/vdoc@latest ',
      downloadUrl: 'https://bitbucket.org/spypoint/vdoc/downloads/',
    },
  }), {
    minimumVersion: '1.6.0',
    updateCommand: 'bun install -g @vosker/vdoc@latest',
    downloadUrl: 'https://bitbucket.org/spypoint/vdoc/downloads/',
  })
})

test('parseVdocCliRequirement rejects a missing or invalid minimum', () => {
  assert.equal(parseVdocCliRequirement({}), null)
  assert.equal(parseVdocCliRequirement({ vdocCli: { minimumVersion: 'latest' } }), null)
})

test('package.json carries valid CLI compatibility metadata', () => {
  const requirement = parseVdocCliRequirement(PACKAGE_JSON)
  assert.ok(requirement)
  assert.match(requirement.minimumVersion, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
  assert.ok(requirement.updateCommand?.includes('@vosker/vdoc@latest'))
})

test('macOS release targets are Apple Silicon only', () => {
  const build = PACKAGE_JSON.build as { mac?: { target?: Array<{ target?: string, arch?: string[] }> } }
  const targets = build.mac?.target ?? []
  for (const name of ['dmg', 'zip']) {
    const target = targets.find(entry => entry.target === name)
    assert.deepEqual(target?.arch, ['arm64'])
  }
})

test('packaged updates use the GitHub feed and allow macOS signing', () => {
  const build = PACKAGE_JSON.build as {
    mac?: { identity?: string | null }
    publish?: Array<Record<string, string>>
  }
  const dependencies = PACKAGE_JSON.dependencies as Record<string, string>

  assert.deepEqual(build.publish, [{ provider: 'github', owner: 'Nerwin', repo: 'vdoc-app' }])
  assert.equal(build.mac?.identity, undefined)
  assert.equal((build.mac as Record<string, unknown>)?.hardenedRuntime, true)
  assert.equal((build.mac as Record<string, unknown>)?.notarize, true)
  assert.match(dependencies['electron-updater'] ?? '', /^\^6\./)
})

test('packaged Electron disables permissive fuses', () => {
  const build = PACKAGE_JSON.build as { electronFuses?: Record<string, boolean> }
  assert.deepEqual(build.electronFuses, {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    grantFileProtocolExtraPrivileges: false,
  })
})
