export class OperationTickets<Payload> {
  private readonly entries = new Map<string, { payload: Payload, expiresAt: number }>()
  private readonly ttlMs: number
  private readonly maxEntries: number
  private readonly now: () => number

  constructor(ttlMs: number, maxEntries: number, now: () => number = Date.now) {
    this.ttlMs = ttlMs
    this.maxEntries = maxEntries
    this.now = now
  }

  issue(token: string, payload: Payload): void {
    this.removeExpired()
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
    this.entries.set(token, { payload, expiresAt: this.now() + this.ttlMs })
  }

  take(token: string): Payload {
    const entry = this.entries.get(token)
    this.entries.delete(token)
    if (!entry || entry.expiresAt < this.now()) throw new Error('Preview expired; run it again')
    return entry.payload
  }

  private removeExpired(): void {
    const now = this.now()
    for (const [token, entry] of this.entries) {
      if (entry.expiresAt < now) this.entries.delete(token)
    }
  }
}
