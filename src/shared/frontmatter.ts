export interface Frontmatter {
  title?: string
  status?: string
  updated?: string
  tags?: string[]
  confluencePageId?: string
  /** Only ever true - any other value (or absence) reads as undefined. */
  confluenceIgnore?: boolean
}

const unquote = (value: string): string => value.replace(/^(["'])(.*)\1$/, '$2')

const BLOCK = /^---\r?\n([\s\S]*?)\r?\n---/

/**
 * Minimal YAML subset - top-level `key: value` scalars and inline `[a, b]` lists,
 * which is all the vdoc frontmatter uses. Anything else is ignored, never an error.
 */
export function parseFrontmatter(content: string): Frontmatter {
  const match = BLOCK.exec(content)
  if (!match) return {}
  const fields = new Map<string, string>()
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (kv) fields.set(kv[1], kv[2].trim())
  }
  const rawTags = fields.get('tags')
  const tags = rawTags?.startsWith('[')
    ? rawTags.replace(/^\[|\]$/g, '').split(',').map(tag => unquote(tag.trim())).filter(Boolean)
    : undefined
  const scalar = (key: string): string | undefined => {
    const value = fields.get(key)
    return value ? unquote(value) : undefined
  }
  return {
    title: scalar('title'),
    status: scalar('status'),
    updated: scalar('updated'),
    tags,
    confluencePageId: scalar('confluencePageId'),
    confluenceIgnore: fields.get('confluenceIgnore') === 'true' || undefined,
  }
}

/** Set (or insert) `confluenceIgnore:` in the frontmatter, creating the block if absent. */
export function setConfluenceIgnore(content: string, ignored: boolean): string {
  const line = `confluenceIgnore: ${ignored}`
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const match = BLOCK.exec(content)
  if (!match) return `---${eol}${line}${eol}---${eol}${eol}${content}`
  const existing = /^confluenceIgnore\s*:[^\r\n]*/m
  const body = existing.test(match[1])
    ? match[1].replace(existing, line)
    : `${match[1]}${eol}${line}`
  return `---${eol}${body}${eol}---${content.slice(match[0].length)}`
}
