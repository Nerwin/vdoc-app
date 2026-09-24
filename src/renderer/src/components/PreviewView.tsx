import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Marked } from 'marked'

import { escapeHtml, previewBody } from '../../../shared/preview-html.ts'
import { BackIcon, CloseIcon, ForwardIcon } from '../icons.tsx'

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

const INFO_SVG = '<svg class="callout-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'

/** One H2 of the rendered preview - the inspector's Outline lists them. */
export interface OutlineItem {
  id: string
  text: string
}

interface Props {
  content: string
  theme: 'dark' | 'light'
  /** Bumped by ⌘F - opens the find bar, or reselects its query when already open. */
  findSeq: number
  /** Intercepted `<a>` clicks - receives the href as written in the markdown. */
  onOpenLink?(href: string): void
  onOutline(items: OutlineItem[]): void
  /** The section in view (scroll-spy), for the Outline's selected row. */
  onActiveSection(id: string | null): void
  /** Receives the scroll-to-section function, for Outline clicks. */
  jumpRef: React.RefObject<((id: string) => void) | null>
}

/** Unique mermaid render ids - an id colliding with an svg already in the DOM breaks the render. */
let mermaidSeq = 0

export function PreviewView({ content, theme, findSeq, onOpenLink, onOutline, onActiveSection, jumpRef }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [html, setHtml] = useState('')
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

  // React 19 re-applies dangerouslySetInnerHTML whenever this element re-renders,
  // rebuilding every node under it - which wipes the heading ids and collapses the
  // find-bar's highlight ranges. Memoizing the element skips that subtree in
  // reconciliation, so the DOM only rebuilds when the html itself changes.
  const contentEl = useMemo(() => (
    <div ref={containerRef} onClick={handleClick} className="preview min-w-0 max-w-[720px] flex-1" dangerouslySetInnerHTML={{ __html: html }} />
  ), [html, handleClick])

  // Mermaid diagrams and colorized code are rendered into the html string itself, not
  // patched into the container afterwards - React re-applies dangerouslySetInnerHTML on
  // re-renders, which would silently wipe any DOM patched in behind its back. The plain
  // body shows immediately; the enriched html replaces it.
  useEffect(() => {
    const body = marked.parse(previewBody(content), { async: false })
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
        const { applyMonacoTheme, monaco } = await import('./monaco-setup.ts')
        applyMonacoTheme(theme)
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
  }, [content, theme])

  // Outline: ids are assigned to the rendered h2 nodes.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const headings = [...container.querySelectorAll<HTMLHeadingElement>('h2')]
    headings.forEach((el, index) => {
      el.id = `sec-${index}`
    })
    onOutline(headings.map((el, index) => ({ id: `sec-${index}`, text: el.textContent ?? '' })))
  }, [html, onOutline])

  /** Scroll-spy: the active section is the last heading above the reading line. */
  const onScroll = (): void => {
    const scroller = scrollRef.current
    const container = containerRef.current
    if (!scroller || !container) return
    const top = scroller.getBoundingClientRect().top
    let current: string | null = null
    for (const el of container.querySelectorAll('h2')) {
      if (el.getBoundingClientRect().top - top <= 96) current = el.id
      else break
    }
    onActiveSection(current ?? container.querySelector('h2')?.id ?? null)
  }

  useEffect(() => {
    jumpRef.current = id => containerRef.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView()
    return () => {
      jumpRef.current = null
    }
  }, [jumpRef])

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
        <div className="flex px-10 py-[34px]">
          {contentEl}
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
        className="w-44 border-none bg-transparent font-mono text-[12.5px] text-ink placeholder-ink-label outline-none focus:shadow-none"
      />
      <span className="min-w-[44px] text-right font-mono text-[11px] text-ink-label">
        {query === '' ? '' : `${ranges.length === 0 ? 0 : active + 1}/${ranges.length}`}
      </span>
      <FindButton title="Previous match (⇧⏎)" onClick={() => step(-1)}><BackIcon size={14} /></FindButton>
      <FindButton title="Next match (⏎)" onClick={() => step(1)}><ForwardIcon size={14} /></FindButton>
      <FindButton title="Close (esc)" onClick={onClose}><CloseIcon size={13} /></FindButton>
    </div>
  )
}

function FindButton({ title, onClick, children }: { title: string, onClick(): void, children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-[5px] text-[12.5px] text-ink-label hover:bg-hover hover:text-ink"
    >
      {children}
    </button>
  )
}
