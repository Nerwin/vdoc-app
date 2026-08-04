import { existsSync, watch } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'

import { CONTENT_DIRS, DOCS_ROOT, setVdocBin } from './vdoc.ts'
import { loadSettings } from './settings.ts'
import { registerIpc } from './ipc.ts'

// Automation hook: VDOC_DEBUG_PORT=9222 npm run dev exposes CDP for driving the app.
if (process.env.VDOC_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.VDOC_DEBUG_PORT)
}

function createWindow(theme: 'dark' | 'light'): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: theme === 'light' ? '#F2F3F5' : '#16171B',
    webPreferences: { preload: join(__dirname, '../preload/index.js') },
  })

  if (process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else window.loadFile(join(__dirname, '../renderer/index.html'))

  return window
}

/** Debounced watcher over the content dirs; notifies the renderer with changed .md paths. */
function watchDocs(window: BrowserWindow): void {
  const pending = new Set<string>()
  let timer: NodeJS.Timeout | undefined

  const flush = (): void => {
    if (pending.size > 0 && !window.isDestroyed()) {
      window.webContents.send('files-changed', [...pending])
    }
    pending.clear()
  }

  for (const dir of CONTENT_DIRS) {
    try {
      watch(join(DOCS_ROOT, dir), { recursive: true }, (_eventType, filename) => {
        if (!filename || !filename.endsWith('.md')) return
        if (filename.split('/').some(segment => segment.startsWith('.'))) return
        pending.add(`${dir}/${filename}`)
        clearTimeout(timer)
        timer = setTimeout(flush, 400)
      })
    } catch {
      // Missing content dir: nothing to watch.
    }
  }
}

app.whenReady().then(() => {
  const settings = loadSettings()
  setVdocBin(settings.vdocBin)

  const icon = join(__dirname, '../../icon.png')
  if (app.dock && existsSync(icon)) app.dock.setIcon(icon)

  registerIpc()
  const window = createWindow(settings.theme)
  watchDocs(window)
})

app.on('window-all-closed', () => app.quit())
