import { useEffect } from 'react'
import type { editor as MonacoEditor } from 'monaco-editor'

import { interpolate } from '../../shared/scroll-sync.ts'

/**
 * Editor + Preview scroll together: blocks tagged with `data-line` anchor each source line to its
 * rendered offset, and positions in between are interpolated. The pane under the pointer (or
 * focus) leads; the other follows, so the two never chase each other.
 */
export function useScrollSync(editor: MonacoEditor.IStandaloneCodeEditor | null, preview: HTMLElement | null, enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !editor || !preview) return
    const editorNode = editor.getDomNode()
    if (!editorNode) return
    let leader: 'editor' | 'preview' = 'editor'

    // ponytail: anchors are re-measured on every scroll event - cache per render if long documents stutter.
    const anchors = (): Array<[number, number]> => {
      const origin = preview.getBoundingClientRect().top - preview.scrollTop
      const blocks = [...preview.querySelectorAll<HTMLElement>('[data-line]')].map((block): [number, number] => [
        editor.getTopForLineNumber(Number(block.dataset.line)),
        block.getBoundingClientRect().top - origin,
      ])
      const ends: [number, number] = [editor.getScrollHeight() - editor.getLayoutInfo().height, preview.scrollHeight - preview.clientHeight]
      return [[0, 0], ...blocks, ends]
    }

    const editorScroll = editor.onDidScrollChange(event => {
      if (leader !== 'editor' || !event.scrollTopChanged) return
      preview.scrollTo({ top: interpolate(anchors(), event.scrollTop), behavior: 'instant' })
    })
    const previewScroll = (): void => {
      if (leader !== 'preview') return
      editor.setScrollTop(interpolate(anchors().map(([a, b]) => [b, a]), preview.scrollTop))
    }
    const leadEditor = (): void => { leader = 'editor' }
    const leadPreview = (): void => { leader = 'preview' }

    preview.addEventListener('scroll', previewScroll)
    for (const type of ['pointerenter', 'wheel', 'focusin'] as const) {
      editorNode.addEventListener(type, leadEditor)
      preview.addEventListener(type, leadPreview)
    }
    return () => {
      editorScroll.dispose()
      preview.removeEventListener('scroll', previewScroll)
      for (const type of ['pointerenter', 'wheel', 'focusin'] as const) {
        editorNode.removeEventListener(type, leadEditor)
        preview.removeEventListener(type, leadPreview)
      }
    }
  }, [editor, preview, enabled])
}
