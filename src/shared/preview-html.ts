import { parseFrontmatter } from './frontmatter.ts'

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function previewMetaLine(content: string): string {
  const fm = parseFrontmatter(content)
  const parts: string[] = []
  if (fm.status) parts.push(`<span class="doc-meta-status" data-status="${escapeHtml(fm.status)}">${escapeHtml(fm.status)}</span>`)
  if (fm.updated) parts.push(`<span>updated ${escapeHtml(formatDate(fm.updated))}</span>`)
  if (fm.tags?.length) parts.push(`<span>${fm.tags.map(escapeHtml).join(' · ')}</span>`)
  if (parts.length === 0) return ''
  return `<div class="doc-meta">${parts.join('<span class="doc-meta-sep">·</span>')}</div>`
}
