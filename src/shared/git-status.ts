/**
 * Paths from `git status --porcelain=v1 -z` (repo-root relative, never quoted), made relative
 * to `prefix` - the docs root's place inside the repo (`git rev-parse --show-prefix`).
 */
export function parseGitStatus(output: string, prefix: string): Set<string> {
  const paths = new Set<string>()
  const fields = output.split('\0')
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]
    if (field.length < 4) continue
    // Renames and copies are "XY new\0old": skip the old path.
    if (field[0] === 'R' || field[0] === 'C') i++
    const path = field.slice(3)
    if (path.startsWith(prefix)) paths.add(path.slice(prefix.length))
  }
  return paths
}
