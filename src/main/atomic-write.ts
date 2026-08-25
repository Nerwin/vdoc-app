import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, openSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'

export function atomicWriteFile(path: string, content: string): void {
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`
  const mode = existsSync(path) ? statSync(path).mode & 0o777 : 0o600
  let file: number | null = null

  try {
    file = openSync(temp, 'wx', mode)
    try {
      writeFileSync(file, content, 'utf8')
      fsyncSync(file)
    } finally {
      const opened = file
      file = null
      closeSync(opened)
    }
    renameSync(temp, path)
  } finally {
    if (file !== null) closeSync(file)
    if (existsSync(temp)) unlinkSync(temp)
  }
}
