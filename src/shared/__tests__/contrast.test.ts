import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

/**
 * Every text token must clear 4.5:1 on each surface it sits on, in both themes.
 * A future tweak that dims a token trips this before it ships.
 */

const CSS = readFileSync(join(import.meta.dirname, '../../renderer/src/styles.css'), 'utf8')

function tokens(selector: string): Record<string, string> {
  const block = CSS.slice(CSS.indexOf(selector) + selector.length)
  const body = block.slice(0, block.indexOf('}'))
  return Object.fromEntries(
    [...body.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/g)].map(match => [match[1], match[2]]),
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

const dark = tokens('@theme static {')
const light = { ...dark, ...tokens(':root[data-theme="light"] {') }

const SURFACES = ['well', 'pane', 'content', 'sidebar', 'raised-row', 'chrome', 'overlay']
const TEXTS = ['ink', 'ink-body', 'control-ink', 'ink-dim', 'ink-mute', 'ink-label', 'link', 'accent', 'sync-text', 'behind', 'conflict', 'warn-text']

/**
 * Text on its own fill: buttons at rest, badges, strips, keycaps, selection.
 * R5 ships two transient states below 4.5 (dark): white on primary hover (4.05) and
 * tertiary/muted on control-hover and selected fills - deliberately not asserted.
 */
const PAIRS: Array<[string, string]> = [
  ['primary-ink', 'primary'],
  ['danger-ink', 'danger'],
  ['danger-ink', 'danger-hover'],
  ['control-ink', 'raised'],
  ['control-ink', 'hover'],
  ['ink', 'row-hover'],
  ['ink-body', 'row-hover'],
  ['ink-dim', 'row-hover'],
  ['selected-ink', 'selected'],
  ['match', 'selected'],
  ['badge-done-ink', 'badge-done-bg'],
  ['badge-active-ink', 'badge-active-bg'],
  ['badge-todo-ink', 'badge-todo-bg'],
  ['banner-ink', 'banner-bg'],
  ['ok-ink', 'ok-bg'],
  ['info-ink', 'info-bg'],
  ['bad-ink', 'bad-bg'],
  ['keycap-ink', 'keycap-bg'],
  ['wordmark-ink', 'wordmark-plate'],
  ['wordmark-accent', 'wordmark-plate'],
]

for (const [name, theme] of [['dark', dark], ['light', light]] as const) {
  test(`every ${name} text token clears 4.5:1 on every surface`, () => {
    for (const text of TEXTS) {
      for (const surface of SURFACES) {
        const ratio = contrast(theme[text], theme[surface])
        assert.ok(ratio >= 4.5, `${text} (${theme[text]}) on ${surface} (${theme[surface]}) is ${ratio.toFixed(2)}:1`)
      }
    }
  })

  test(`every ${name} filled pair clears 4.5:1`, () => {
    for (const [text, surface] of PAIRS) {
      assert.ok(theme[text] && theme[surface], `missing token: ${text} / ${surface}`)
      const ratio = contrast(theme[text], theme[surface])
      assert.ok(ratio >= 4.5, `${text} (${theme[text]}) on ${surface} (${theme[surface]}) is ${ratio.toFixed(2)}:1`)
    }
  })

  test(`${name} disabled ink and brand stay above the 3:1 non-text floor`, () => {
    assert.ok(contrast(theme['ink-disabled'], theme.pane) >= 3)
    for (const surface of ['pane', 'sidebar', 'selected']) assert.ok(contrast(theme.brand, theme[surface]) >= 3)
  })
}
