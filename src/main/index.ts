import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, Menu, nativeTheme } from 'electron'

import type { Settings } from '../shared/types.ts'
import { setVdocBin } from './vdoc.ts'
import { loadSettings } from './settings.ts'
import { registerIpc } from './ipc.ts'
import { watchDocs } from './watcher.ts'

// Automation hook: VDOC_DEBUG_PORT=9222 npm run dev exposes CDP for driving the app.
if (process.env.VDOC_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.VDOC_DEBUG_PORT)
}

function createWindow(theme: Settings['theme']): BrowserWindow {
  const dark = theme === 'system' ? nativeTheme.shouldUseDarkColors : theme === 'dark'
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: dark ? '#101113' : '#f2f4f7',
    webPreferences: { preload: join(__dirname, '../preload/index.js') },
  })

  if (process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else window.loadFile(join(__dirname, '../renderer/index.html'))

  return window
}

app.setName('V-DOC')

let mainWindow: BrowserWindow | null = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    const settings = loadSettings()
    setVdocBin(settings.vdocBin)

    // Dev only — the packaged bundle carries its own icon from build/icon.png.
    const icon = join(__dirname, '../../build/icon.png')
    if (app.dock && existsSync(icon)) app.dock.setIcon(icon)

    // Only OS roles in the menu: the app's own shortcuts live in the renderer registry, and
    // the default View menu would swallow ⌘R / ⌘⇧R / ⌥⌘I before the window ever sees them.
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
      { role: 'editMenu' as const },
      { role: 'windowMenu' as const },
    ]))

    registerIpc()
    mainWindow = createWindow(settings.theme)
    watchDocs(mainWindow)

    // Automation hook: VDOC_SHOT=/path.png captures the window via the compositor
    // (no macOS screen-recording permission needed) and quits. VDOC_SHOT_DELAY_MS tunes the
    // wait; VDOC_SHOT_JS runs a script in the renderer (e.g. to select a file) 2.5s before capture.
    if (process.env.VDOC_SHOT) {
      const shotPath = process.env.VDOC_SHOT
      const script = process.env.VDOC_SHOT_JS
      setTimeout(() => {
        void (async () => {
          try {
            if (script) {
              await mainWindow?.webContents.executeJavaScript(script)
              await new Promise(resolve => setTimeout(resolve, 2500))
            }
            const image = await mainWindow!.webContents.capturePage()
            await writeFile(shotPath, image.toPNG())
          } catch (error) {
            console.error('VDOC_SHOT failed:', error)
          }
          app.quit()
        })()
      }, Number(process.env.VDOC_SHOT_DELAY_MS) || 6000)
    }
  })
}

app.on('window-all-closed', () => app.quit())
