export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** The markdown the preview renders - everything but the frontmatter - and the source line it starts on. */
export function previewBody(content: string): { body: string, firstLine: number } {
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(content)?.[0] ?? ''
  return { body: content.slice(frontmatter.length), firstLine: 1 + (frontmatter.match(/\n/g)?.length ?? 0) }
}

/** Tags a rendered block's opening element with the source line it starts on. */
export function withSourceLine(html: string, line: number): string {
  return html.replace(/^\s*<([a-z][\w-]*)/i, `<$1 data-line="${line}"`)
}
