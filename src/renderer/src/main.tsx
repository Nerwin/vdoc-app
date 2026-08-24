import { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

import './styles.css'
import './highlight.css'
import { App } from './App.tsx'

/** Last-resort net: a render crash shows the error instead of unmounting to a black window. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ padding: 32, fontFamily: 'system-ui', maxWidth: 640 }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#e5484d', marginBottom: 8 }}>V-DOC hit an unexpected error</h1>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.5, color: '#888', marginBottom: 16 }}>
          {this.state.error.message}
        </pre>
        <button
          onClick={() => window.location.reload()}
          style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid #555', background: 'transparent', color: '#888', cursor: 'pointer' }}
        >
          Reload
        </button>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>)
