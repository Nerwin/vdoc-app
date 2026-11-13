import { watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import type { BrowserWindow } from 'electron'

import { joinRepoPath } from '../shared/repo-path.ts'
import { isIgnoredWatchPath } from '../shared/watch-policy.ts'
import { EXCLUDED_DIRS } from './settings.ts'
import { availableRepos } from './vdoc.ts'

let watchers: FSWatcher[] = []

/**
 * (Re)start the debounced watchers over every repository's content dirs; notifies
 * the renderer with changed .md app paths. Call again after the repo list changes.
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

  for (const repo of availableRepos()) {
    for (const dir of repo.contentDirs) {
      try {
        const watcher = watch(join(repo.root, dir), { recursive: true }, (_eventType, filename) => {
          if (!filename || !filename.endsWith('.md')) return
          // App-internal paths always use forward slashes; Windows reports backslashes.
          const rel = filename.replaceAll('\\', '/')
          if (isIgnoredWatchPath(rel, EXCLUDED_DIRS)) return
          pending.add(joinRepoPath(repo.alias, dir ? `${dir}/${rel}` : rel))
          clearTimeout(timer)
          timer = setTimeout(flush, 400)
        })
        // A removed or locked dir emits 'error'; unhandled, it would crash the main process.
        watcher.on('error', () => watcher.close())
        watchers.push(watcher)
      } catch {
        // Missing content dir: nothing to watch.
      }
    }
  }
}
