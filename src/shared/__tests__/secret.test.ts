import { test } from 'node:test'
import assert from 'node:assert/strict'

import { maskSecret } from '../secret.ts'

test('maskSecret shows first and last 4 characters', () => {
  assert.equal(maskSecret('ATATT3xFfGF0abcdef123456'), 'ATAT…3456')
})

test('maskSecret never reveals most of a short value', () => {
  assert.equal(maskSecret('short'), '••••')
  assert.equal(maskSecret('elevenchars'), '••••')
})
