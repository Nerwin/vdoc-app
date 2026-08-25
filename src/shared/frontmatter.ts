export interface Frontmatter {
  title?: string
  status?: string
  updated?: string
  tags?: string[]
  confluencePageId?: string
  confluencePageVersion?: number
  /** Only ever true - any other value (or absence) reads as undefined. */
  confluenceIgnore?: boolean
}

const unquote = (value: string): string => value.replace(/^(["'])(.*)\1$/, '$2')

const BLOCK = /^---(\r?\n)([\s\S]*?)^---[ \t]*(\r?\n|$)/m

function blockBody(match: RegExpExecArray): string {
  return match[2].replace(/\r?\n$/, '')
}

function inlineList(value: string | undefined): string[] | undefined {
  if (!value?.startsWith('[') || !value.endsWith(']')) return undefined
  return value.slice(1, -1)
    .split(',')
    .map(item => unquote(item.trim()))
    .filter(Boolean)
}

function positiveInteger(value: string | undefined): number | undefined {
  if (!value || !/^\+?\d+$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

/**
 * Minimal YAML subset - top-level `key: value` scalars and inline `[a, b]` lists,
 * which is all the vdoc frontmatter uses. Anything else is ignored, never an error.
 */
export function parseFrontmatter(content: string): Frontmatter {
  const match = BLOCK.exec(content)
  if (!match) return {}
  const fields = new Map<string, string>()
  for (const line of blockBody(match).split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (kv) fields.set(kv[1], kv[2].trim())
  }
  const scalar = (key: string): string | undefined => {
    const value = fields.get(key)
    if (!value) return undefined
    return unquote(value) || undefined
  }
  return {
    title: scalar('title'),
    status: scalar('status'),
    updated: scalar('updated'),
    tags: inlineList(fields.get('tags')),
    confluencePageId: scalar('confluencePageId'),
    confluencePageVersion: positiveInteger(fields.get('confluencePageVersion')),
    confluenceIgnore: fields.get('confluenceIgnore') === 'true' || undefined,
  }
}

function upsertIgnore(body: string, line: string, eol: string): string {
  const lines = body ? body.split(/\r?\n/) : []
  let replaced = false
  const next = lines.flatMap(existing => {
    if (!/^confluenceIgnore\s*:/.test(existing)) return [existing]
    if (replaced) return []
    replaced = true
    return [line]
  })
  if (!replaced) next.push(line)
  return next.join(eol)
}

/** Set (or insert) `confluenceIgnore:` in the frontmatter, creating the block if absent. */
export function setConfluenceIgnore(content: string, ignored: boolean): string {
  const line = `confluenceIgnore: ${ignored}`
  const match = BLOCK.exec(content)
  if (!match) {
    const eol = content.match(/\r\n|\n/)?.[0] ?? '\n'
    return `---${eol}${line}${eol}---${eol}${eol}${content}`
  }

  const eol = match[1]
  const body = upsertIgnore(blockBody(match), line, eol)
  return `---${eol}${body}${eol}---${match[3]}${content.slice(match[0].length)}`
}
