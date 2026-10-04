import { useEffect, useRef } from 'react'

import type { DiffResult } from '../../../shared/types.ts'
import { applyMonacoTheme, EDITOR_FONT, monaco } from './monaco-setup.ts'

interface Props {
  /** A new result recreates both models - review edits never outlive their diff. */
  diff: DiffResult
  /** Local is the original (left / removed) side; otherwise Confluence is. */
  localFirst: boolean
  inline: boolean
  /** The modified side becomes the merge result: editable, with Monaco's per-change revert arrows. */
  onEdit?(text: string): void
  theme: 'dark' | 'light'
}

export function DiffView({ diff, localFirst, inline, onEdit, theme }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const onEditRef = useRef(onEdit)
  onEditRef.current = onEdit
  const editable = onEdit !== undefined

  useEffect(() => {
    if (!containerRef.current) return
    const editor = monaco.editor.createDiffEditor(containerRef.current, {
      readOnly: !onEdit,
      originalEditable: false,
      renderSideBySide: !inline,
      useInlineViewWhenSpaceIsLimited: false,
      automaticLayout: true,
      hideUnchangedRegions: { enabled: true },
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderOverviewRuler: false,
      fontSize: 12,
      fontFamily: EDITOR_FONT,
      wordWrap: 'on',
    })
    editorRef.current = editor
    const modifiedEditor = editor.getModifiedEditor()
    modifiedEditor.onDidChangeModelContent(() => onEditRef.current?.(modifiedEditor.getValue()))
    return () => {
      const model = editor.getModel()
      editor.dispose()
      model?.original.dispose()
      model?.modified.dispose()
    }
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const previous = editor.getModel()
    editor.setModel({
      original: monaco.editor.createModel(localFirst ? diff.local : diff.remote, 'markdown'),
      modified: monaco.editor.createModel(localFirst ? diff.remote : diff.local, 'markdown'),
    })
    previous?.original.dispose()
    previous?.modified.dispose()
  }, [diff, localFirst])

  useEffect(() => editorRef.current?.updateOptions({ renderSideBySide: !inline, readOnly: !editable }), [inline, editable])

  useEffect(() => applyMonacoTheme(theme), [theme])

  return <div ref={containerRef} className="h-full w-full" />
}
