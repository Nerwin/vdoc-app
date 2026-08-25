const MAX_CLIPBOARD_TEXT_LENGTH = 1024 * 1024

export function clipboardText(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_CLIPBOARD_TEXT_LENGTH) {
    throw new Error('Invalid clipboard text')
  }
  return value
}
