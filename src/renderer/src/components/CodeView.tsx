import { useEffect, useRef } from 'react'

import { applyMonacoTheme, EDITOR_FONT, monaco } from './monaco-setup.ts'

export function CodeView({ content, onChange, onSave, theme }: {
  content: string
  /** Present = editable; called with the full text after every edit. */
  onChange?: (text: string) => void
  /** ⌘S - flush pending edits to disk immediately. */
  onSave?: () => void
  theme: 'dark' | 'light'
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  onChangeRef.current = onChange
  onSaveRef.current = onSave
  const editable = Boolean(onChange)

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
    editor.onDidChangeModelContent(() => onChangeRef.current?.(editor.getValue()))
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSaveRef.current?.())
    editorRef.current = editor
    // The editor owns the implicit model created from `value` and disposes it itself.
    return () => editor.dispose()
  }, [])

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly: !editable })
  }, [editable])

  useEffect(() => applyMonacoTheme(theme), [theme])

  // Only push external content in - echoing the editor's own value back via
  // setValue would reset the cursor on every keystroke.
  useEffect(() => {
    const editor = editorRef.current
    if (editor && editor.getValue() !== content) editor.setValue(content)
  }, [content])

  return <div ref={containerRef} className="h-full w-full" />
}
