/**
 * CLI result status read from the command's JSON, not the process. A non-zero exit
 * is a finding until the CLI says otherwise: only an explicit error status, an oclif
 * error payload, or a spawn/timeout failure is an error.
 */
import type { VdocLogEntry } from './types.ts'
import { vdocCommandId } from './privacy.ts'

export type CliOutcome = 'success' | 'findings' | 'warning' | 'error'

export interface CliStatus {
  outcome: CliOutcome
  /** Semantic sentence for the STATUS cell - `Error - validation failed`. */
  summary: string
}

const SEVERITY: CliOutcome[] = ['success', 'findings', 'warning', 'error']

type Payload = Record<string, unknown>

function parsePayload(stdout: string): Payload | null {
  try {
    const parsed: unknown = JSON.parse(stdout)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Payload : null
  } catch {
    return null
  }
}

/** oclif prints `{ error: { name, message, code } }`; thrown errors carry `stack` + `message`. */
function errorMessage(payload: Payload): string | null {
  const nested = payload.error
  if (nested && typeof nested === 'object') {
    const { message, code, name } = nested as { message?: unknown, code?: unknown, name?: unknown }
    const label = typeof code === 'string' ? code : typeof name === 'string' ? name : null
    const text = typeof message === 'string' ? message : 'command failed'
    return label ? `${humanize(label)}: ${text}` : text
  }
  if ('stack' in payload && typeof payload.message === 'string') return payload.message
  return null
}

const humanize = (value: string): string => value.replaceAll(/[_-]+/g, ' ').toLowerCase()

export function cliStatus(entry: Pick<VdocLogEntry, 'exitCode' | 'stdout' | 'termination'>): CliStatus {
  if (entry.termination === 'cancelled') return { outcome: 'warning', summary: 'Warning - cancelled before it finished' }
  if (entry.termination === 'timeout') return { outcome: 'error', summary: 'Error - timed out' }
  if (entry.exitCode === -1) return { outcome: 'error', summary: 'Error - the vdoc binary could not be started' }

  const payload = parsePayload(entry.stdout)
  if (payload) {
    const failure = errorMessage(payload)
    if (failure) return { outcome: 'error', summary: `Error - ${failure}` }
    const status = payload.status
    if (status === 'success') return { outcome: 'success', summary: 'Success' }
    if (status === 'warning') return { outcome: 'warning', summary: `Warning - ${detail(payload) ?? 'the CLI reported a warning'}` }
    if (status === 'error') return { outcome: 'error', summary: `Error - ${detail(payload) ?? 'the CLI reported an error'}` }
    if (status === 'findings' || typeof payload.result === 'string') {
      return { outcome: 'findings', summary: `Findings - ${typeof payload.result === 'string' ? humanize(payload.result) : 'see output'}` }
    }
  }

  return entry.exitCode === 0
    ? { outcome: 'success', summary: 'Success' }
    : { outcome: 'findings', summary: `Findings - exit ${entry.exitCode}, a valid outcome, not a failure` }
}

function detail(payload: Payload): string | null {
  return typeof payload.message === 'string' ? payload.message : null
}

/** The most severe outcome of a session - drives the status-bar CLI glyph. */
export function worstOutcome(outcomes: Iterable<CliOutcome>): CliOutcome {
  let worst: CliOutcome = 'success'
  for (const outcome of outcomes) if (SEVERITY.indexOf(outcome) > SEVERITY.indexOf(worst)) worst = outcome
  return worst
}

export function detectFormat(text: string): 'json' | 'text' {
  return parsePayload(text) || (text.trim().startsWith('[') && safeJson(text)) ? 'json' : 'text'
}

function safeJson(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/** Product-level reading of a finding or error - null when there is nothing to add. */
export function interpretCli(entry: Pick<VdocLogEntry, 'args' | 'exitCode' | 'stdout' | 'termination'>, status: CliStatus): string | null {
  if (status.outcome === 'success') return null
  const command = vdocCommandId(entry.args)
  if (status.outcome === 'error' && /unsupported block|cannot represent|lossy/i.test(status.summary)) {
    return 'This is a blocking finding, not a crash. Pushing would remove remote content that Markdown cannot represent.'
  }
  if (status.outcome === 'error') return 'The CLI stopped with an error. Nothing was synchronized by this command.'
  if (status.outcome === 'warning') return 'The command did not complete; rerun it from the document once the app is idle.'
  switch (command) {
    case 'cf check': return 'Some documents differ from their Confluence version. This is drift to review, not a failure.'
    case 'cf diff': return 'Local content differs from the Confluence page. Review the diff before pushing or pulling.'
    case 'cf lint': return 'Lint reported issues in the document. They do not block a push.'
    default: return 'A non-zero exit here means findings, not failure.'
  }
}

/** The document a command ran against - the first argument that is a known repo path. */
export function documentOf(args: string[], known: (path: string) => boolean): string | null {
  return args.find(arg => arg.endsWith('.md') && known(arg.replace(/^\.\//, ''))) ?? null
}
