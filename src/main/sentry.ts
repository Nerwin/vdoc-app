import { init } from '@sentry/electron/main'
import { app } from 'electron'

import { loadSettings } from './settings.ts'

/**  Empty = crash reporting disabled. */
const SENTRY_DSN = 'https://6cfa8827584ccea22d96e946c5620457@o4511967956303872.ingest.de.sentry.io/4511967958663248'

/** True when the main SDK is running - the renderer only inits its side then. */
export let sentryActive = false

/** Call after app.setName - loadSettings caches the userData path on first call. */
export function initSentry(): void {
  sentryActive = Boolean(SENTRY_DSN) && app.isPackaged && loadSettings().crashReports
  if (sentryActive) init({ dsn: SENTRY_DSN })
}
