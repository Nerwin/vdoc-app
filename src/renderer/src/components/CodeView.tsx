import { useEffect, useRef } from 'react'

import { EDITOR_FONT, monaco } from './monaco-setup.ts'

export function CodeView({ content }: { content: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const editor = monaco.editor.create(containerRef.current, {
      value: '',
      language: 'markdown',
      readOnly: true,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 12,
      fontFamily: EDITOR_FONT,
      wordWrap: 'on',
      lineNumbers: 'off',
      folding: false,
      renderLineHighlight: 'none',
      occurrencesHighlight: 'off',
    })
    editorRef.current = editor
    return () => {
      const model = editor.getModel()
      editor.dispose()
      model?.dispose()
    }
  }, [])

  useEffect(() => {
    editorRef.current?.setValue(content)
  }, [content])

  return <div ref={containerRef} className="h-full w-full" />
}
