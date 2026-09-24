import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'

;(globalThis as typeof globalThis & { MonacoEnvironment?: monaco.Environment }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}

const token = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim()

/** Monaco themes are global - one call restyles every open editor. Colours come from the CSS tokens. */
export function applyMonacoTheme(theme: 'dark' | 'light'): void {
  const name = `vdoc-${theme}`
  monaco.editor.defineTheme(name, {
    base: theme === 'light' ? 'vs' : 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword.md', foreground: token('json-key').slice(1) },
      { token: 'string.md', foreground: token('json-string').slice(1) },
      { token: 'variable.md', foreground: token('ink-dim').slice(1) },
    ],
    colors: {
      'editor.background': token('content'),
      'editor.foreground': token('ink-body'),
      'diffEditor.insertedTextBackground': `${token('sync')}26`,
      'diffEditor.removedTextBackground': `${token('conflict')}26`,
      'diffEditor.insertedLineBackground': `${token('sync')}14`,
      'diffEditor.removedLineBackground': `${token('conflict')}14`,
      'editorLineNumber.foreground': token('ink-label'),
    },
  })
  monaco.editor.setTheme(name)
}

applyMonacoTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')

export const EDITOR_FONT = '"JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, monospace'

export { monaco }
