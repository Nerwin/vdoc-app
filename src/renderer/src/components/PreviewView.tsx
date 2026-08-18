import { useEffect, useMemo, useRef, useState } from 'react'
import { Marked } from 'marked'

import { parseFrontmatter } from '../../../shared/frontmatter.ts'

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

const formatDate = (iso: string): string => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** The frontmatter rendered as a quiet meta line, injected right under the doc's H1. */
function metaLine(content: string): string {
  const fm = parseFrontmatter(content)
  const parts: string[] = []
  if (fm.status) parts.push(`<span class="doc-meta-status" data-status="${escapeHtml(fm.status)}">${escapeHtml(fm.status)}</span>`)
  if (fm.updated) parts.push(`<span>updated ${escapeHtml(formatDate(fm.updated))}</span>`)
  if (fm.tags?.length) parts.push(`<span>${fm.tags.map(escapeHtml).join(' · ')}</span>`)
  if (parts.length === 0) return ''
  return `<div class="doc-meta">${parts.join('<span class="doc-meta-sep">·</span>')}</div>`
}

interface TocItem {
  id: string
  text: string
  sub: boolean
}

interface Props {
  content: string
  theme: 'dark' | 'light'
  /** Intercepted `<a>` clicks — receives the href as written in the markdown. */
  onOpenLink?(href: string): void
}

export function PreviewView({ content, theme, onOpenLink }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [html, setHtml] = useState('')
  const [toc, setToc] = useState<TocItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  // Never let a link navigate the window — local .md links open in-app,
  // everything else goes through the handler (external browser) or nowhere.
  const handleClick = (event: React.MouseEvent): void => {
    const anchor = (event.target as HTMLElement).closest('a')
    const href = anchor?.getAttribute('href')
    if (!href) return
    event.preventDefault()
    onOpenLink?.(href)
  }

  const meta = useMemo(() => metaLine(content), [content])

  useEffect(() => {
    let body = marked.parse(stripFrontmatter(content), { async: false })
    // The meta line sits under the H1; a doc without one gets it at the top.
    if (meta) body = body.includes('</h1>') ? body.replace('</h1>', `</h1>${meta}`) : meta + body
    setHtml(body)
  }, [content, meta])

  // The "On this page" rail: ids are assigned to the rendered h2/h3 nodes.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const headings = [...container.querySelectorAll<HTMLHeadingElement>('h2, h3')]
    headings.forEach((el, index) => {
      el.id = `sec-${index}`
    })
    setToc(headings.map((el, index) => ({ id: `sec-${index}`, text: el.textContent ?? '', sub: el.tagName === 'H3' })))
    setActiveId(current => (current && headings.some(el => el.id === current) ? current : headings[0]?.id ?? null))
  }, [html])

  /** Scroll-spy: the active section is the last heading above the reading line. */
  const onScroll = (): void => {
    const scroller = scrollRef.current
    const container = containerRef.current
    if (!scroller || !container || toc.length < 2) return
    const top = scroller.getBoundingClientRect().top
    let current: string | null = null
    for (const el of container.querySelectorAll('h2, h3')) {
      if (el.getBoundingClientRect().top - top <= 96) current = el.id
      else break
    }
    setActiveId(current ?? toc[0]?.id ?? null)
  }

  const jumpTo = (id: string): void => {
    containerRef.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView()
    setActiveId(id)
  }

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
    <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto scroll-smooth motion-reduce:scroll-auto">
      <div className="mx-auto flex max-w-[1080px] justify-center gap-14 px-10 pb-16 pt-12">
        <div ref={containerRef} onClick={handleClick} className="preview min-w-0 max-w-[680px] flex-1" dangerouslySetInnerHTML={{ __html: html }} />
        {toc.length >= 2 && (
          <nav aria-label="On this page" className="sticky top-6 hidden max-h-[75vh] w-[200px] shrink-0 self-start overflow-y-auto @min-[960px]:block">
            <p className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-ghost">On this page</p>
            {toc.map(item => (
              <button
                key={item.id}
                onClick={() => jumpTo(item.id)}
                className={`block w-full border-l-2 py-[5px] pr-2 text-left font-sans text-[12.5px] leading-[1.4] ${
                  item.id === activeId ? 'border-select-edge text-ink' : 'border-line-subtle text-ink-dim hover:text-ink'
                } ${item.sub ? 'pl-6' : 'pl-3'}`}
              >
                {item.text}
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  )
}
