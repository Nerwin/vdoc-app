/** First 4 + last 4 characters for identifying a secret - short values stay fully hidden. */
export function maskSecret(value: string): string {
  if (value.length < 12) return '••••'
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}
