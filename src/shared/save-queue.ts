import type { FileWriteRequest, FileWriteResult } from './types.ts'

interface SaveFailure {
  path: string
  error: unknown
}

export interface SaveFlushResult {
  saved: boolean
  failures: SaveFailure[]
}

type FileWriter = (request: FileWriteRequest) => Promise<FileWriteResult>

export class GuardedSaveQueue {
  private readonly disk = new Map<string, string>()
  private readonly pending = new Map<string, FileWriteRequest>()
  private activePath: string | null = null
  private drain: Promise<SaveFlushResult> | null = null
  private revision = 0
  private readonly write: FileWriter

  constructor(write: FileWriter) {
    this.write = write
  }

  setDisk(path: string, content: string): void {
    this.disk.set(path, content)
  }

  queue(path: string, content: string): void {
    const expected = this.disk.get(path)
    if (expected === undefined) throw new Error(`Could not save ${path.split('/').at(-1)} because its disk version is unknown.`)
    this.pending.set(path, { path, expected, next: content, revision: ++this.revision })
  }

  discard(path: string): void {
    this.pending.delete(path)
  }

  draft(path: string): string | undefined {
    return this.pending.get(path)?.next
  }

  hasPending(path?: string): boolean {
    return path === undefined ? this.pending.size > 0 : this.pending.has(path)
  }

  isSaving(path?: string): boolean {
    return path === undefined ? this.activePath !== null : this.activePath === path
  }

  flush(): Promise<SaveFlushResult> {
    if (this.drain) return this.drain
    this.drain = this.flushPending().finally(() => {
      this.drain = null
    })
    return this.drain
  }

  private async flushPending(): Promise<SaveFlushResult> {
    const failures: SaveFailure[] = []
    const failedPaths = new Set<string>()

    while (true) {
      const next = [...this.pending.entries()].find(([path]) => !failedPaths.has(path))
      if (!next) break
      const [path, request] = next
      this.pending.delete(path)

      if (request.expected === request.next) {
        this.disk.set(path, request.next)
        continue
      }

      this.activePath = path
      try {
        const result = await this.write(request)
        if (result.revision !== request.revision) throw new Error(`Save acknowledgement mismatch for ${path}`)
        this.disk.set(path, request.next)
        const queued = this.pending.get(path)
        if (queued) queued.expected = request.next
      } catch (error) {
        failures.push({ path, error })
        failedPaths.add(path)
        if (!this.pending.has(path)) this.pending.set(path, request)
      } finally {
        this.activePath = null
      }
    }

    return { saved: this.pending.size === 0, failures }
  }
}
