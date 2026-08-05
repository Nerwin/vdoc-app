import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'

import { setVdocBin } from './vdoc.ts'
import { loadSettings } from './settings.ts'
import { registerIpc } from './ipc.ts'
import { watchDocs } from './watcher.ts'

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

    registerIpc()
    mainWindow = createWindow(settings.theme)
    watchDocs(mainWindow)
  })
}

app.on('window-all-closed', () => app.quit())
