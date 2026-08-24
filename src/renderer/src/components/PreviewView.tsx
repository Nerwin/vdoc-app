import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Marked } from 'marked'

import { parseFrontmatter } from '../../../shared/frontmatter.ts'

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
  /** Bumped by ⌘F - opens the find bar, or reselects its query when already open. */
  findSeq: number
  /** Intercepted `<a>` clicks - receives the href as written in the markdown. */
  onOpenLink?(href: string): void
}

/** Unique mermaid render ids - an id colliding with an svg already in the DOM breaks the render. */
let mermaidSeq = 0

export function PreviewView({ content, theme, findSeq, onOpenLink }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [html, setHtml] = useState('')
  const [toc, setToc] = useState<TocItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [findOpen, setFindOpen] = useState(false)

  useEffect(() => {
    if (findSeq > 0) setFindOpen(true)
  }, [findSeq])

  // Never let a link navigate the window - local .md links open in-app,
  // everything else goes through the handler (external browser) or nowhere.
  const handleClick = useCallback((event: React.MouseEvent): void => {
    const anchor = (event.target as HTMLElement).closest('a')
    const href = anchor?.getAttribute('href')
    if (!href) return
    event.preventDefault()
    onOpenLink?.(href)
  }, [onOpenLink])

  const meta = useMemo(() => metaLine(content), [content])

  // React 19 re-applies dangerouslySetInnerHTML whenever this element re-renders,
  // rebuilding every node under it - which wipes the heading ids and collapses the
  // find-bar's highlight ranges. Memoizing the element skips that subtree in
  // reconciliation, so the DOM only rebuilds when the html itself changes.
  const contentEl = useMemo(() => (
    <div ref={containerRef} onClick={handleClick} className="preview min-w-0 max-w-[680px] flex-1" dangerouslySetInnerHTML={{ __html: html }} />
  ), [html, handleClick])

  // Mermaid diagrams and colorized code are rendered into the html string itself, not
  // patched into the container afterwards - React re-applies dangerouslySetInnerHTML on
  // re-renders, which would silently wipe any DOM patched in behind its back. The plain
  // body shows immediately; the enriched html replaces it.
  useEffect(() => {
    let body = marked.parse(stripFrontmatter(content), { async: false })
    // The meta line sits under the H1; a doc without one gets it at the top.
    if (meta) body = body.includes('</h1>') ? body.replace('</h1>', `</h1>${meta}`) : meta + body
    setHtml(body)
    const needsMermaid = body.includes('class="mermaid-source"')
    const needsColor = body.includes('data-lang="')
    if (!needsMermaid && !needsColor) return

    let live = true
    void (async () => {
      const doc = new DOMParser().parseFromString(body, 'text/html')
      if (needsMermaid) {
        const sources = [...doc.querySelectorAll<HTMLPreElement>('pre.mermaid-source')]
        const { default: mermaid } = await import('mermaid')
        mermaid.initialize({ startOnLoad: false, theme: theme === 'light' ? 'neutral' : 'dark', securityLevel: 'strict' })
        for (const source of sources) {
          if (!live) return
          try {
            const { svg } = await mermaid.render(`preview-mmd-${++mermaidSeq}`, source.textContent ?? '')
            const wrapper = doc.createElement('div')
            wrapper.className = 'mermaid-diagram'
            wrapper.innerHTML = svg
            source.replaceWith(wrapper)
          } catch {
            source.classList.add('mermaid-error')
          }
        }
      }
      if (needsColor) {
        // Monaco is already loaded (the editor pane) - colorize emits global .mtk* spans
        // whose colours come from the active vdoc theme; a theme switch re-runs this effect.
        const { monaco } = await import('./monaco-setup.ts')
        const known = new Set(monaco.languages.getLanguages().map(language => language.id))
        for (const block of doc.querySelectorAll('pre.code-block[data-lang] > code')) {
          const lang = (block.parentElement as HTMLElement).dataset.lang ?? ''
          if (!known.has(lang) || !live) continue
          const colorized = await monaco.editor.colorize(block.textContent ?? '', lang, {})
          block.innerHTML = colorized.replace(/<br\/?>$/, '')
        }
      }
      if (live) setHtml(doc.body.innerHTML)
    })()
    return () => {
      live = false
    }
  }, [content, meta, theme])

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

  return (
    <div className="relative h-full">
      {findOpen && (
        <FindBar
          containerRef={containerRef}
          scrollRef={scrollRef}
          html={html}
          seq={findSeq}
          onClose={() => setFindOpen(false)}
        />
      )}
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto scroll-smooth motion-reduce:scroll-auto">
        <div className="mx-auto flex max-w-[1080px] justify-center gap-14 px-10 pb-16 pt-12">
          {contentEl}
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
    </div>
  )
}

const FIND = 'vdoc-find'
const FIND_ACTIVE = 'vdoc-find-active'

/**
 * In-document find over the rendered preview. Matches are painted with the CSS
 * Custom Highlight API - ranges, not DOM edits, so dangerouslySetInnerHTML
 * re-renders can never wipe them (see the mermaid gotcha above).
 */
function FindBar({ containerRef, scrollRef, html, seq, onClose }: {
  containerRef: React.RefObject<HTMLDivElement | null>
  scrollRef: React.RefObject<HTMLDivElement | null>
  /** Recompute matches whenever the rendered html changes (typing in split view, mermaid pass). */
  html: string
  /** ⌘F while open reselects the query. */
  seq: number
  onClose(): void
}) {
  const [query, setQuery] = useState('')
  const [ranges, setRanges] = useState<Range[]>([])
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.select(), [seq])

  useEffect(() => {
    const container = containerRef.current
    if (!container || query === '') {
      CSS.highlights.delete(FIND)
      setRanges([])
      return
    }
    // ponytail: per-text-node substring scan - a phrase crossing inline markup (bold, links) is missed.
    const found: Range[] = []
    const lower = query.toLowerCase()
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      const haystack = (node.textContent ?? '').toLowerCase()
      let index = haystack.indexOf(lower)
      while (index !== -1) {
        const range = new Range()
        range.setStart(node, index)
        range.setEnd(node, index + lower.length)
        found.push(range)
        index = haystack.indexOf(lower, index + lower.length)
      }
    }
    CSS.highlights.set(FIND, new Highlight(...found))
    setRanges(found)
    setActive(0)
  }, [containerRef, query, html])

  // The active match gets its own highlight and scrolls to the middle of the pane.
  useEffect(() => {
    const range = ranges[active]
    if (!range) {
      CSS.highlights.delete(FIND_ACTIVE)
      return
    }
    CSS.highlights.set(FIND_ACTIVE, new Highlight(range))
    const scroller = scrollRef.current
    if (!scroller) return
    const offset = range.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    scroller.scrollBy({ top: offset - scroller.clientHeight / 2 })
  }, [ranges, active, scrollRef])

  useEffect(() => () => {
    CSS.highlights.delete(FIND)
    CSS.highlights.delete(FIND_ACTIVE)
  }, [])

  const step = (delta: number): void => {
    if (ranges.length > 0) setActive(current => (current + delta + ranges.length) % ranges.length)
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      step(event.shiftKey ? -1 : 1)
    }
  }

  return (
    <div className="absolute right-6 top-3 z-20 flex items-center gap-1 rounded-lg border border-line-menu bg-overlay px-2 py-1.5 shadow-menu">
      <input
        ref={inputRef}
        autoFocus
        value={query}
        onChange={event => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Find in document…"
        spellCheck={false}
        className="w-44 border-none bg-transparent font-mono text-[12.5px] text-ink placeholder-ink-faint outline-none focus:shadow-none"
      />
      <span className="min-w-[44px] text-right font-mono text-[11px] text-ink-faint">
        {query === '' ? '' : `${ranges.length === 0 ? 0 : active + 1}/${ranges.length}`}
      </span>
      <FindButton title="Previous match (⇧⏎)" onClick={() => step(-1)}>‹</FindButton>
      <FindButton title="Next match (⏎)" onClick={() => step(1)}>›</FindButton>
      <FindButton title="Close (esc)" onClick={onClose}>✕</FindButton>
    </div>
  )
}

function FindButton({ title, onClick, children }: { title: string, onClick(): void, children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-[5px] text-[12.5px] text-ink-ghost hover:bg-hover hover:text-ink"
    >
      {children}
    </button>
  )
}
