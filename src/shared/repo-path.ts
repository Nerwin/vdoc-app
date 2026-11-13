/** App paths are `<alias>/<relative path>`; the alias names a repository in settings. */

export function splitRepoPath(path: string): { alias: string, rel: string } {
  const slash = path.indexOf('/')
  return slash === -1 ? { alias: path, rel: '' } : { alias: path.slice(0, slash), rel: path.slice(slash + 1) }
}

/** An empty `rel` is the repo itself - no trailing slash. */
export function joinRepoPath(alias: string, rel: string): string {
  return rel ? `${alias}/${rel}` : alias
}

/** `base`, then `base-2`, `base-3`... until one is not taken. */
export function uniqueAlias(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/** A path the CLI echoed back (as given, `./`-prefixed, or backslashed on Windows) as an app path. */
export function fromCliPath(alias: string, file: string): string {
  return joinRepoPath(alias, file.replaceAll('\\', '/').replace(/^\.\//, ''))
}

/** The space mapping is keyed by the top-level folder inside the repository. */
export function mappingKey(path: string): string {
  return splitRepoPath(path).rel.split('/')[0]
}
