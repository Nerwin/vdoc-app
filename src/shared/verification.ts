import type { DiffResult } from './types.ts'

interface VerificationFailure {
  path: string
  error: unknown
}

export interface VerificationBatchResult {
  verified: string[]
  different: string[]
  failed: VerificationFailure[]
}

export async function verifyBatch(
  paths: string[],
  verify: (path: string) => Promise<DiffResult>,
  onProgress?: (done: number, total: number) => void,
): Promise<VerificationBatchResult> {
  const result: VerificationBatchResult = { verified: [], different: [], failed: [] }

  for (const [index, path] of paths.entries()) {
    onProgress?.(index + 1, paths.length)
    try {
      const diff = await verify(path)
      if (diff.baselineRecorded) result.verified.push(path)
      else result.different.push(path)
    } catch (error) {
      result.failed.push({ path, error })
    }
  }

  return result
}
