export function isIgnoredWatchPath(path: string, excludedDirs: ReadonlySet<string>): boolean {
  return path.split('/').some(segment => segment.startsWith('.') || excludedDirs.has(segment))
}
