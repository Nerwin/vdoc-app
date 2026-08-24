import { useEffect, useRef } from 'react'

import { EDITOR_FONT, monaco } from './monaco-setup.ts'

interface Props {
  /** Remote (Confluence) body - the "original" side. */
  remote: string
  /** Local file body - the "modified" side. */
  local: string
}

export function DiffView({ remote, local }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const editor = monaco.editor.createDiffEditor(containerRef.current, {
      readOnly: true,
      originalEditable: false,
      renderSideBySide: true,
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
      original: monaco.editor.createModel(remote, 'markdown'),
      modified: monaco.editor.createModel(local, 'markdown'),
    })
    previous?.original.dispose()
    previous?.modified.dispose()
  }, [remote, local])

  return <div ref={containerRef} className="h-full w-full" />
}
