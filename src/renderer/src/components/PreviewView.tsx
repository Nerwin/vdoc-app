import { useEffect, useRef, useState } from 'react'
import { Marked } from 'marked'

/** Body-only markdown → HTML. Raw HTML in the source is escaped, never executed. */
const marked = new Marked({
  gfm: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text)
    },
    code({ text, lang }) {
      if (lang === 'mermaid') return `<pre class="mermaid-source">${escapeHtml(text)}</pre>`
      return `<pre class="code-block"><code>${escapeHtml(text)}</code></pre>`
    },
  },
})

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const stripFrontmatter = (content: string): string => content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')

interface Props {
  content: string
  theme: 'dark' | 'light'
}

export function PreviewView({ content, theme }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [html, setHtml] = useState('')

  useEffect(() => {
    setHtml(marked.parse(stripFrontmatter(content), { async: false }))
  }, [content])

  // Mermaid only loads (once) when a diagram is actually on screen.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const sources = [...container.querySelectorAll<HTMLPreElement>('pre.mermaid-source')]
    if (sources.length === 0) return

    let live = true
    void (async () => {
      const { default: mermaid } = await import('mermaid')
      mermaid.initialize({ startOnLoad: false, theme: theme === 'light' ? 'neutral' : 'dark', securityLevel: 'strict' })
      for (const [index, source] of sources.entries()) {
        if (!live) return
        try {
          const { svg } = await mermaid.render(`preview-mmd-${index}`, source.textContent ?? '')
          if (!live) return
          const wrapper = document.createElement('div')
          wrapper.className = 'mermaid-diagram'
          wrapper.innerHTML = svg
          source.replaceWith(wrapper)
        } catch {
          source.classList.add('mermaid-error')
        }
      }
    })()
    return () => {
      live = false
    }
  }, [html, theme])

  return (
    <div className="h-full overflow-y-auto">
      <div ref={containerRef} className="preview mx-auto max-w-3xl px-8 py-6" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
