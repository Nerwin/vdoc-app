import { init, startSpan } from '@sentry/electron/main'
import { app } from 'electron'

import { scrubSentryEvent, scrubSentryTransaction, sentryActionName, SENTRY_ACTION_PREFIX } from '../shared/privacy.ts'
import { loadSettings } from './settings.ts'

/** Empty = diagnostics disabled. */
const SENTRY_DSN = 'https://6cfa8827584ccea22d96e946c5620457@o4511967956303872.ingest.de.sentry.io/4511967958663248'

/** True when the main SDK is running - the renderer only inits its side then. */
export let sentryActive = false

/** Call after app.setName - loadSettings caches the userData path on first call. */
export function initSentry(): void {
  sentryActive = Boolean(SENTRY_DSN) && app.isPackaged && loadSettings().crashReports
  if (sentryActive) {
    init({
      dsn: SENTRY_DSN,
      beforeSend: event => scrubSentryEvent(event),
      beforeSendTransaction: event => scrubSentryTransaction(event),
      tracesSampler: context => context.name.startsWith(SENTRY_ACTION_PREFIX) ? 1 : 0,
    })
  }
}

export async function traceAppAction<Result>(action: string, run: () => Result | Promise<Result>): Promise<Result> {
  if (!sentryActive) return run()
  return startSpan({
    name: sentryActionName(action),
    op: 'app.action',
    forceTransaction: true,
  }, async span => {
    try {
      const result = await run()
      span.setStatus({ code: 1 })
      return result
    } catch (error) {
      span.setStatus({ code: 2, message: 'internal_error' })
      throw error
    }
  })
}
