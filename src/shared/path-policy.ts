import { realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

const MAX_PATH_LENGTH = 4096

function isOutside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

export function relativeAppPath(value: unknown, label = 'path'): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PATH_LENGTH) {
    throw new Error(`Invalid ${label}`)
  }
  if (value.includes('\0') || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) {
    throw new Error(`Invalid ${label}`)
  }
  if (value.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

export function resolvePathInsideRoot(root: string, value: unknown, label = 'path'): string {
  const rootPath = resolve(root)
  const candidate = resolve(rootPath, relativeAppPath(value, label))
  if (isOutside(rootPath, candidate)) throw new Error(`Invalid ${label}`)
  return candidate
}

export function resolveExistingPathInsideRoot(root: string, value: unknown, label = 'path'): string {
  const rootPath = realpathSync(resolve(root))
  const candidate = realpathSync(resolvePathInsideRoot(rootPath, value, label))
  if (isOutside(rootPath, candidate)) throw new Error(`Invalid ${label}`)
  return candidate
}
