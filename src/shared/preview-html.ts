export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** The markdown the preview renders: no frontmatter, no leading H1 - the header already shows the title. */
export function previewBody(content: string): string {
  return content
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .replace(/^\s*(?:#[ \t]+[^\n]*|[^\n#][^\n]*\r?\n=+[ \t]*)(?:\r?\n|$)/, '')
}
