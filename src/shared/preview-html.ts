import { Marked } from 'marked'

import { docImageUrl } from './links.ts'

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

/** Fence language → Monaco language id, for the common shorthands. */
const LANG_ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  yml: 'yaml',
  py: 'python',
  md: 'markdown',
}

/** Body-only markdown → HTML. Raw HTML in the source is escaped, never executed. */
const marked = new Marked({
  gfm: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text)
    },
    code({ text, lang }) {
      if (lang === 'mermaid') return `<pre class="mermaid-source">${escapeHtml(text)}</pre>`
      const language = LANG_ALIASES[lang ?? ''] ?? lang ?? ''
      const attr = /^[\w+-]+$/.test(language) ? ` data-lang="${language}"` : ''
      return `<pre class="code-block"${attr}><code>${escapeHtml(text)}</code></pre>`
    },
    // A callout strip: the Lucide info icon, no left accent border.
    blockquote({ tokens }) {
      // GitHub alert markers (`> [!NOTE]`) are syntax, not content.
      const body = this.parser.parse(tokens).replace(/^<p>\[!\w+\]\s*/, '<p>')
      return `<blockquote class="callout">${INFO_SVG}<div>${body}</div></blockquote>`
    },
  },
})

/** Renders block by block so each top-level element carries its source line (scroll sync). */
export function renderPreview(content: string, path: string): string {
  const { body, firstLine } = previewBody(content)
  const tokens = marked.lexer(body)
  marked.walkTokens(tokens, token => {
    if (token.type === 'image') token.href = docImageUrl(path, token.href) ?? token.href
  })
  let line = firstLine
  return tokens.map(token => {
    const html = withSourceLine(marked.parser([token]), line)
    line += token.raw.split('\n').length - 1
    return html
  }).join('')
}

const INFO_SVG = '<svg class="callout-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
