import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

/**
 * The light palette is only correct while every text token still clears 4.5:1 on the
 * surface it sits on. A future tweak that dims a token trips this before it ships.
 */

const CSS = readFileSync(join(import.meta.dirname, '../../renderer/src/styles.css'), 'utf8')

function tokens(selector: string): Record<string, string> {
  const block = CSS.slice(CSS.indexOf(selector) + selector.length)
  const body = block.slice(0, block.indexOf('}'))
  return Object.fromEntries(
    [...body.matchAll(/(--color-[\w-]+):\s*(#[0-9a-f]{6})/g)].map(match => [match[1], match[2]]),
  )
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(offset => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

const light = tokens(':root[data-theme="light"] {')

/** Text roles, and the lightest surface each one is allowed to sit on. */
const TEXT_ON_SURFACE: Array<[string, string]> = [
  ['--color-ink', '--color-pane'],
  ['--color-ink-body', '--color-pane'],
  ['--color-ink-mid', '--color-pane'],
  ['--color-ink-dim', '--color-pane'],
  ['--color-ink-mute', '--color-pane'],
  ['--color-ink-label', '--color-pane'],
  ['--color-ink-faint', '--color-pane'],
  ['--color-sync-text', '--color-pane'],
  ['--color-behind', '--color-pane'],
  ['--color-conflict', '--color-pane'],
  ['--color-accent', '--color-pane'],
  ['--color-warn-text', '--color-pane'],
  ['--color-attention', '--color-chrome'],
  ['--color-pill-ink', '--color-pill-bg'],
  ['--color-banner-ink', '--color-banner-bg'],
  ['--color-selected-ink', '--color-selected'],
  ['--color-keycap-ink', '--color-keycap-bg'],
  ['--color-match', '--color-selected'],
]

test('every light text token clears 4.5:1 on its surface', () => {
  for (const [text, surface] of TEXT_ON_SURFACE) {
    const ink = light[text]
    const bg = light[surface]
    assert.ok(ink && bg, `missing token: ${text} / ${surface}`)
    const ratio = contrast(ink, bg)
    assert.ok(ratio >= 4.5, `${text} (${ink}) on ${surface} (${bg}) is ${ratio.toFixed(2)}:1`)
  }
})

test('the disabled token stays above the 3:1 non-text floor', () => {
  // Disabled palette rows are deliberately below 4.5 - but never below the UI-element floor.
  assert.ok(contrast(light['--color-ink-ghost'], light['--color-pane']) >= 3)
})

test('the dark column still ships the values it shipped', () => {
  const dark = tokens('@theme {')
  assert.equal(dark['--color-sidebar'], '#17181a')
  assert.equal(dark['--color-content'], '#131416')
  assert.equal(dark['--color-ink'], '#e6e9ec')
  assert.equal(dark['--color-accent'], '#5aa1e0')
})
