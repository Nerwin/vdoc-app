/** Markdown link helpers shared by the backlinks scan (main) and the preview (renderer). */

/** Inline-link targets ending in .md, as written (fragment/query kept out). */
export function mdLinkTargets(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(([^)\s]+?\.md)(?:[#?][^)]*)?\)/g)].map(match => match[1])
}

/**
 * Resolve `href` against the directory of `fromFile` (both repo-relative,
 * `/`-separated). Null for absolute URLs, other schemes, or paths that
 * escape the root.
 */
export function resolveRelative(fromFile: string, href: string): string | null {
  const clean = decodeURI(href.split(/[#?]/)[0])
  if (clean === '' || clean.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(clean)) return null
  const stack: string[] = []
  for (const part of [...fromFile.split('/').slice(0, -1), ...clean.split('/')]) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (stack.length === 0) return null
      stack.pop()
    } else {
      stack.push(part)
    }
  }
  return stack.join('/')
}
