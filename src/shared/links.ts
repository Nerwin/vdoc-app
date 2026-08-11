/** Markdown link helpers shared by the backlinks scan (main) and the preview (renderer). */

/**
 * Page id from a bare numeric id or a Confluence page URL — mirrors the CLI's
 * parsePageArg. Null when the input is neither.
 */
export function confluencePageId(input: string): string | null {
  if (/^\d+$/.test(input)) return input
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }
  const spaces = /^\/wiki\/spaces\/[^/]+\/pages\/(\d+)(?:\/|$)/.exec(url.pathname)
  if (spaces) return spaces[1]
  if (url.pathname === '/wiki/pages/viewpage.action') {
    const pageId = url.searchParams.get('pageId')
    if (pageId && /^\d+$/.test(pageId)) return pageId
  }
  return null
}

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
