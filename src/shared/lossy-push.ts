export function isLossyPushError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('--allow-lossy')
}

export class LossyPushAccess {
  readonly #paths = new Set<string>()

  allows(path: string): boolean {
    return this.#paths.has(path)
  }

  grantAfterError(path: string, error: unknown): boolean {
    if (!isLossyPushError(error)) return false
    this.#paths.add(path)
    return true
  }

  revoke(path: string): void {
    this.#paths.delete(path)
  }
}
