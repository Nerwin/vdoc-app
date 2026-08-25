import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url))

function executable(command) {
  return command === 'npm' && process.platform === 'win32' ? 'npm.cmd' : command
}

export function executeCommand(command, args, { capture = false } = {}) {
  const result = spawnSync(executable(command), args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  })

  const label = [command, ...args].join(' ')
  if (result.error) throw new Error(`Could not run ${label}: ${result.error.message}`)
  if (result.status !== 0) {
    const detail = capture ? result.stderr.trim() : ''
    throw new Error(detail ? `${label} failed: ${detail}` : `${label} failed`)
  }

  return capture ? result.stdout.trim() : ''
}

function ensureCleanWorkingTree(execute) {
  const changes = execute('git', ['status', '--porcelain'], { capture: true })
  if (changes) throw new Error('The working tree must be clean before releasing')
}

export function validateRelease(execute = executeCommand) {
  const branch = execute('git', ['branch', '--show-current'], { capture: true })
  if (branch !== 'main') throw new Error(`Releases must run from main, not ${branch || 'a detached HEAD'}`)

  ensureCleanWorkingTree(execute)

  execute('git', ['fetch', '--quiet', 'origin', 'main'])
}

export function publishRelease(execute = executeCommand) {
  validateRelease(execute)
  execute('npm', ['test'])
  ensureCleanWorkingTree(execute)
  execute('npm', ['run', 'bump'])
  execute('git', ['push', '--atomic', '--follow-tags', 'origin', 'main'])
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  try {
    publishRelease()
  } catch (error) {
    console.error(`Release aborted: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
