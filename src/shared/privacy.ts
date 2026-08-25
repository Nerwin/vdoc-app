const HIDDEN = '•••'

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

function safeErrorType(type: unknown): string {
  return typeof type === 'string' && /^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(type) ? type : 'ApplicationError'
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
