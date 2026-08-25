import assert from 'node:assert/strict'
import test from 'node:test'

import { isAllowedNavigation, isTrustedRendererLocation, SECURE_WEB_PREFERENCES } from '../electron-policy.ts'

test('renderer web preferences keep Electron isolation enabled', () => {
  assert.deepEqual(SECURE_WEB_PREFERENCES, {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  })
  assert.ok(Object.isFrozen(SECURE_WEB_PREFERENCES))
})

test('packaged IPC accepts only the exact application page', () => {
  const expected = 'file:///Applications/V-DOC.app/Contents/Resources/app.asar/out/renderer/index.html'
  assert.equal(isTrustedRendererLocation(expected, `${expected}#preview`, true), true)
  assert.equal(isTrustedRendererLocation(expected, `${expected}?redirect=1`, true), false)
  assert.equal(isTrustedRendererLocation(expected, 'file:///tmp/index.html', true), false)
})

test('development IPC accepts only the configured renderer origin', () => {
  const expected = 'http://localhost:5173/'
  assert.equal(isTrustedRendererLocation(expected, 'http://localhost:5173/settings', false), true)
  assert.equal(isTrustedRendererLocation(expected, 'http://127.0.0.1:5173/', false), false)
  assert.equal(isTrustedRendererLocation(expected, 'not a URL', false), false)
})

test('navigation stays on the page already loaded in the window', () => {
  assert.equal(isAllowedNavigation('file:///app/index.html', 'file:///app/index.html'), true)
  assert.equal(isAllowedNavigation('file:///app/index.html', 'https://example.com/'), false)
})
