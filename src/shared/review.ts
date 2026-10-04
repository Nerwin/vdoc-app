export type ReviewOutcome = 'theirs' | 'mine' | 'merged'

const lf = (text: string): string => text.replace(/\r\n/g, '\n')

/** What the reviewed Confluence side amounts to: untouched, fully reverted to local, or a mix. */
export function reviewOutcome(result: string, local: string, remote: string): ReviewOutcome {
  if (lf(result) === lf(remote)) return 'theirs'
  if (lf(result) === lf(local)) return 'mine'
  return 'merged'
}

/**
 * The CLI diff body may be a slice of the file on disk - splice the merge back only when it maps
 * exactly, compared in LF and written in the file's own line endings.
 */
export function spliceMerged(disk: string, local: string, merged: string): string {
  const [file, body, next] = [lf(disk), lf(local), lf(merged)]
  const at = file.indexOf(body)
  if (at === -1 || file.indexOf(body, at + 1) !== -1) {
    throw new Error('The diff does not map back to the file on disk - reload the document and review again, or merge in the editor.')
  }
  const result = file.slice(0, at) + next + file.slice(at + body.length)
  return disk.includes('\r\n') ? result.replace(/\n/g, '\r\n') : result
}
