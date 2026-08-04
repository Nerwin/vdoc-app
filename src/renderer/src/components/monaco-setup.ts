import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'

;(globalThis as typeof globalThis & { MonacoEnvironment?: monaco.Environment }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}

monaco.editor.defineTheme('vdoc-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#16171b',
    'editor.foreground': '#d6d9e0',
    'diffEditor.insertedTextBackground': '#4e9e7726',
    'diffEditor.removedTextBackground': '#d95f4e26',
    'diffEditor.insertedLineBackground': '#4e9e7714',
    'diffEditor.removedLineBackground': '#d95f4e14',
    'editorLineNumber.foreground': '#565c69',
  },
})

monaco.editor.defineTheme('vdoc-light', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#fafafc',
    'editor.foreground': '#2a2e37',
    'diffEditor.insertedTextBackground': '#257a4e26',
    'diffEditor.removedTextBackground': '#c0443526',
    'diffEditor.insertedLineBackground': '#257a4e12',
    'diffEditor.removedLineBackground': '#c0443512',
    'editorLineNumber.foreground': '#9aa1ad',
  },
})

/** Monaco themes are global — one call restyles every open editor. */
export function applyMonacoTheme(theme: 'dark' | 'light'): void {
  monaco.editor.setTheme(theme === 'light' ? 'vdoc-light' : 'vdoc-dark')
}

applyMonacoTheme('dark')

export const EDITOR_FONT = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace'

export { monaco }
