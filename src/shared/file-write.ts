export function contentForGuardedWrite(current: string, expected: string, next: string): string {
  if (current !== expected) {
    throw new Error('File changed on disk while editing. Reload it before saving again.')
  }
  return next
}
