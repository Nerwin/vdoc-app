const HIDDEN = '•••'
export const SENTRY_ACTION_PREFIX = 'app.action.'
export const SENTRY_UPDATE_PREFIX = 'app.update.'

const SAFE_LOG_ATTRIBUTE_KEYS = new Set([
  'app.version',
  'os.name',
  'update.current',
  'update.latest',
  'update.phase',
])

export function redactVdocArgs(args: string[]): string[] {
  const commentBody = args[0] === 'cf' && args[1] === 'comment' ? 3 : -1
  return args.map((arg, index) => (args[index - 1] === '--encrypt' || index === commentBody ? HIDDEN : arg))
}

export function vdocCommandId(args: string[]): string {
  return args.slice(0, 2)
    .filter(arg => /^[a-z][a-z-]*$/i.test(arg))
    .join(' ') || 'command'
}

export function hidesVdocOutput(args: string[]): boolean {
  return args.includes('--encrypt') || args.includes('--decrypt') || (args[0] === 'cf' && args[1] === 'comment')
}

interface EventFrame {
  function?: string
  module?: string
  lineno?: number
  colno?: number
  in_app?: boolean
  [key: string]: unknown
}

interface EventValue {
  type?: string
  value?: string
  stacktrace?: { frames?: EventFrame[], [key: string]: unknown }
  [key: string]: unknown
}

interface SentryEventLike {
  exception?: { values?: EventValue[], [key: string]: unknown }
  message?: string
  breadcrumbs?: unknown[]
  request?: unknown
  user?: unknown
  extra?: unknown
  logentry?: unknown
  [key: string]: unknown
}

interface SentrySpanLike {
  description?: unknown
  data?: unknown
  tags?: unknown
  [key: string]: unknown
}

interface SentryTransactionLike extends SentryEventLike {
  transaction?: unknown
  spans?: SentrySpanLike[]
}

interface SentryLogLike {
  message?: unknown
  attributes?: Record<string, unknown>
  [key: string]: unknown
}

function safeErrorType(type: unknown): string {
  return typeof type === 'string' && /^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(type) ? type : 'ApplicationError'
}

export function sentryActionName(action: unknown): string {
  return typeof action === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(action)
    ? `${SENTRY_ACTION_PREFIX}${action}`
    : `${SENTRY_ACTION_PREFIX}unknown`
}

export function scrubSentryEvent<Event>(event: Event): Event {
  const source = event as SentryEventLike
  const exception = source.exception?.values
    ? {
        ...source.exception,
        values: source.exception.values.map(value => ({
          ...value,
          type: safeErrorType(value.type),
          value: 'Application error',
          stacktrace: value.stacktrace?.frames
            ? {
                ...value.stacktrace,
                frames: value.stacktrace.frames.map(frame => ({
                  function: frame.function,
                  module: frame.module,
                  lineno: frame.lineno,
                  colno: frame.colno,
                  in_app: frame.in_app,
                })),
              }
            : value.stacktrace,
        })),
      }
    : source.exception

  return {
    ...source,
    exception,
    message: source.message ? 'Application error' : undefined,
    breadcrumbs: [],
    request: undefined,
    user: undefined,
    extra: undefined,
    logentry: undefined,
  } as Event
}

export function scrubSentryTransaction<Event>(event: Event): Event {
  const scrubbed = scrubSentryEvent(event) as SentryTransactionLike
  const action = typeof scrubbed.transaction === 'string' && scrubbed.transaction.startsWith(SENTRY_ACTION_PREFIX)
    ? scrubbed.transaction.slice(SENTRY_ACTION_PREFIX.length)
    : undefined

  return {
    ...scrubbed,
    transaction: sentryActionName(action),
    spans: scrubbed.spans?.map(span => ({
      ...span,
      description: undefined,
      data: undefined,
      tags: undefined,
    })),
  } as Event
}

export function scrubSentryLog<Log>(log: Log): Log | null {
  const source = log as SentryLogLike
  if (typeof source.message !== 'string' || !/^app\.(?:lifecycle|update)\.[a-z][a-z0-9-]{0,63}$/.test(source.message)) {
    return null
  }

  const attributes = Object.fromEntries(
    Object.entries(source.attributes ?? {})
      .filter(([key, value]) => SAFE_LOG_ATTRIBUTE_KEYS.has(key)
        && (typeof value === 'number' || typeof value === 'boolean'
          || (typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value)))),
  )

  return { ...source, attributes } as Log
}
