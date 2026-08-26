import { captureException, init, logger, setUser, startSpan } from '@sentry/electron/main'
import { app } from 'electron'

import { scrubSentryEvent, scrubSentryLog, scrubSentryTransaction, sentryActionName, SENTRY_ACTION_PREFIX, SENTRY_UPDATE_PREFIX } from '../shared/privacy.ts'
import { loadSettings } from './settings.ts'

/** Empty = diagnostics disabled. */
const SENTRY_DSN = 'https://6cfa8827584ccea22d96e946c5620457@o4511967956303872.ingest.de.sentry.io/4511967958663248'

/** True when the main SDK is running - the renderer only inits its side then. */
export let sentryActive = false

type AppLogLevel = 'info' | 'warn' | 'error'
type AppLogAttributes = Record<string, string | number | boolean>

/** Call after app.setName - loadSettings caches the userData path on first call. */
export function initSentry(): void {
  sentryActive = Boolean(SENTRY_DSN) && app.isPackaged && loadSettings().crashReports
  if (sentryActive) {
    init({
      dsn: SENTRY_DSN,
      enableLogs: true,
      environment: 'production',
      release: `vdoc-app@${app.getVersion()}`,
      beforeSend: event => scrubSentryEvent(event),
      beforeSendLog: log => scrubSentryLog(log),
      beforeSendTransaction: event => scrubSentryTransaction(event),
      tracesSampler: context => context.name.startsWith(SENTRY_ACTION_PREFIX)
        || context.name.startsWith(SENTRY_UPDATE_PREFIX) ? 1 : 0,
    })
    setUser({ id: loadSettings().installId })
    logAppEvent('info', 'app.lifecycle.started', {
      'app.version': app.getVersion(),
      'os.name': process.platform,
    })
  }
}

async function traceOperation<Result>(name: string, op: string, run: () => Result | Promise<Result>): Promise<Result> {
  if (!sentryActive) return run()
  return startSpan({
    name,
    op,
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

export function traceAppAction<Result>(action: string, run: () => Result | Promise<Result>): Promise<Result> {
  return traceOperation(sentryActionName(action), 'app.action', run)
}

export function traceUpdateCheck<Result>(run: () => Result | Promise<Result>): Promise<Result> {
  return traceOperation(`${SENTRY_UPDATE_PREFIX}check`, 'app.update', run)
}

export function captureAppException(error: unknown): void {
  if (sentryActive) captureException(error)
}

export function logAppEvent(level: AppLogLevel, event: string, attributes: AppLogAttributes = {}): void {
  if (!sentryActive) return
  if (level === 'error') logger.error(event, attributes)
  else if (level === 'warn') logger.warn(event, attributes)
  else logger.info(event, attributes)
}
