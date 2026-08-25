export class CancellableOperation {
  private controller: AbortController | null = null

  start(): AbortSignal {
    if (this.controller) throw new Error('Operation already running')
    this.controller = new AbortController()
    return this.controller.signal
  }

  cancel(): void {
    this.controller?.abort()
  }

  finish(signal: AbortSignal): void {
    if (this.controller?.signal === signal) this.controller = null
  }

  get running(): boolean {
    return this.controller !== null
  }
}
