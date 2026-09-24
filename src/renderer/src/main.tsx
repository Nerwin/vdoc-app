import { captureException, init as sentryInit } from '@sentry/electron/renderer'
import { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './styles.css'
import './highlight.css'
import { App } from './App.tsx'
import { scrubSentryEvent } from '../../shared/privacy.ts'

// Main owns the DSN and the settings toggle; the renderer only mirrors its state.
void window.vdoc?.sentryActive()
  .then(active => active && sentryInit({ beforeSend: event => scrubSentryEvent(event) }))
  .catch(() => undefined)

/** Last-resort net: a render crash shows the error instead of unmounting to a black window. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  // React 19 does not rethrow boundary-caught errors to window, so report here.
  componentDidCatch(error: Error): void {
    captureException(error)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="h-full max-w-[640px] bg-pane p-8 font-sans">
        <h1 className="mb-2 text-[15px] font-semibold text-conflict">V-DOC hit an unexpected error</h1>
        <pre className="mb-4 whitespace-pre-wrap text-[12px] leading-normal text-ink-dim">
          {this.state.error.message}
        </pre>
        <button
          onClick={() => window.location.reload()}
          className="cursor-pointer rounded-md border border-control px-3.5 py-1.5 text-[12px] text-ink-dim"
        >
          Reload
        </button>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>)
