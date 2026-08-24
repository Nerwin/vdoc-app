export interface Frontmatter {
  title?: string
  status?: string
  updated?: string
  tags?: string[]
}

const unquote = (value: string): string => value.replace(/^(["'])(.*)\1$/, '$2')

/**
 * Minimal YAML subset - top-level `key: value` scalars and inline `[a, b]` lists,
 * which is all the vdoc frontmatter uses. Anything else is ignored, never an error.
 */
export function parseFrontmatter(content: string): Frontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
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
  return { title: scalar('title'), status: scalar('status'), updated: scalar('updated'), tags }
}
