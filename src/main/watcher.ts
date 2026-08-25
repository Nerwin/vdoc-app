import { watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import type { BrowserWindow } from 'electron'

import { isIgnoredWatchPath } from '../shared/watch-policy.ts'
import { EXCLUDED_DIRS } from './settings.ts'
import { docsRoot, getContentDirs } from './vdoc.ts'

let watchers: FSWatcher[] = []

/**
 * (Re)start the debounced watchers over the configured content dirs; notifies
 * the renderer with changed .md paths. Call again after the dir list changes.
 */
export function watchDocs(window: BrowserWindow): void {
  for (const watcher of watchers) watcher.close()
  watchers = []

  const pending = new Set<string>()
  let timer: NodeJS.Timeout | undefined

  const flush = (): void => {
    if (pending.size > 0 && !window.isDestroyed()) {
      window.webContents.send('files-changed', [...pending])
    }
    pending.clear()
  }

  for (const dir of getContentDirs()) {
    try {
      const watcher = watch(join(docsRoot(), dir), { recursive: true }, (_eventType, filename) => {
        if (!filename || !filename.endsWith('.md')) return
        // App-internal paths always use forward slashes; Windows reports backslashes.
        const rel = filename.replaceAll('\\', '/')
        if (isIgnoredWatchPath(rel, EXCLUDED_DIRS)) return
        pending.add(`${dir}/${rel}`)
        clearTimeout(timer)
        timer = setTimeout(flush, 400)
      })
      watchers.push(watcher)
    } catch {
      // Missing content dir: nothing to watch.
    }
  }
}
