import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const rendererDir = join(import.meta.dirname, '..', 'out', 'renderer')
const html = await readFile(join(rendererDir, 'index.html'), 'utf8')
const entry = html.match(/<script[^>]+src="\.\/assets\/(index-[^"]+\.js)"/)?.[1]
if (!entry) throw new Error('Could not find the renderer entry bundle')

const { size } = await stat(join(rendererDir, 'assets', entry))
const limit = 1_250_000
if (size > limit) throw new Error(`Renderer entry is ${size} bytes; limit is ${limit}`)
console.log(`Renderer entry: ${size} bytes`)
