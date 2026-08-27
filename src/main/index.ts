import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, Menu, nativeTheme, net, protocol, session } from 'electron'

import { isAllowedNavigation, PACKAGED_RENDERER_URL, SECURE_WEB_PREFERENCES } from '../shared/electron-policy.ts'
import { CloseGuardState } from '../shared/close-guard.ts'
import type { Settings } from '../shared/types.ts'
import { importLoginShellEnv, setVdocBin } from './vdoc.ts'
import { loadSettings } from './settings.ts'
import { registerIpc } from './ipc.ts'
import { initSentry } from './sentry.ts'
import { initializeUpdater } from './update.ts'
import { watchDocs } from './watcher.ts'

protocol.registerSchemesAsPrivileged([{
  scheme: 'vdoc-app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false },
}])

function registerRendererProtocol(): void {
  const root = resolve(__dirname, '../renderer')
  protocol.handle('vdoc-app', request => {
    const url = new URL(request.url)
    if (url.host !== 'renderer') return new Response(null, { status: 404 })

    const path = resolve(root, `.${decodeURIComponent(url.pathname)}`)
    const fromRoot = relative(root, path)
    if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) return new Response(null, { status: 404 })
    return net.fetch(pathToFileURL(path).href)
  })
}

// Automation hook: VDOC_DEBUG_PORT=9222 bun run dev exposes CDP for driving the app.
if (!app.isPackaged && process.env.VDOC_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.VDOC_DEBUG_PORT)
}

const CLOSE_RESPONSE_TIMEOUT_MS = 10_000
let mainWindow: BrowserWindow | null = null
const closeGuard = new CloseGuardState()
let closeResponseTimer: NodeJS.Timeout | undefined

function applicationIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../../build/icon.png')
}

async function finishClose(saved: boolean): Promise<void> {
  const completion = closeGuard.completeSave(saved)
  if (completion === 'ignore') return
  clearTimeout(closeResponseTimer)

  const window = mainWindow
  if (!window || window.isDestroyed()) return
  if (completion === 'confirm-discard') {
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      title: 'Unsaved changes',
      message: 'The latest editor changes could not be saved.',
      detail: 'Keep V-DOC open to resolve the save error, or close and discard those changes.',
      buttons: ['Keep open', 'Close without saving'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    if (closeGuard.completeDiscard(response === 1) !== 'close') return
  }

  window.close()
}

function guardWindowClose(window: BrowserWindow): void {
  window.on('close', event => {
    if (window.webContents.isDestroyed()) return
    const request = closeGuard.requestClose()
    if (request === 'close') return
    event.preventDefault()
    if (request === 'wait') return
    window.webContents.send('close-requested')
    closeResponseTimer = setTimeout(() => void finishClose(false), CLOSE_RESPONSE_TIMEOUT_MS)
  })
  window.on('closed', () => clearTimeout(closeResponseTimer))
}

function createWindow(theme: Settings['theme']): BrowserWindow {
  const dark = theme === 'system' ? nativeTheme.shouldUseDarkColors : theme === 'dark'
  const icon = applicationIconPath()
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 600,
    // The traffic-light inset chrome is macOS-only; Windows/Linux keep the native frame.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 14 } }
      : existsSync(icon) ? { icon } : {}),
    backgroundColor: dark ? '#101113' : '#f2f4f7',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      ...SECURE_WEB_PREFERENCES,
    },
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(window.webContents.getURL(), url)) event.preventDefault()
  })
  guardWindowClose(window)

  if (process.argv.includes('--smoke-test')) {
    window.webContents.once('did-fail-load', (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame) return
      console.error(`Packaged smoke test failed to load ${url}: ${code} ${description}`)
      app.exit(1)
    })
    window.webContents.once('did-finish-load', () => {
      void window.webContents.executeJavaScript(
        `new Promise(resolve => {
          const deadline = Date.now() + 5000
          const probe = () => {
            const ready = window.location.href === ${JSON.stringify(PACKAGED_RENDERER_URL)} && document.getElementById('root')?.childElementCount && window.vdoc
            if (ready) void window.vdoc.sentryActive().then(value => resolve(typeof value === 'boolean'), () => resolve(false))
            else if (Date.now() >= deadline) resolve(false)
            else setTimeout(probe, 50)
          }
          probe()
        })`,
      ).then(healthy => app.exit(healthy ? 0 : 1), error => {
        console.error('Packaged smoke test failed:', error)
        app.exit(1)
      })
    })
  }

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else window.loadURL(PACKAGED_RENDERER_URL)

  return window
}

app.setName('V-DOC')
initSentry()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    registerRendererProtocol()
    importLoginShellEnv()
    const settings = loadSettings()
    setVdocBin(settings.vdocBin)

    // Dev only - packaged macOS uses the bundle .icns; the raw png has no rounded mask.
    const icon = applicationIconPath()
    if (!app.isPackaged && app.dock && existsSync(icon)) app.dock.setIcon(icon)

    // macOS: only OS roles - the default View menu would swallow ⌘R / ⌘⇧R / ⌥⌘I before
    // the window sees them. Windows/Linux: no menu bar; every action lives in the palette.
    if (process.platform === 'darwin') {
      Menu.setApplicationMenu(Menu.buildFromTemplate([
        { role: 'appMenu' as const },
        { role: 'editMenu' as const },
        { role: 'windowMenu' as const },
      ]))
    } else {
      Menu.setApplicationMenu(null)
    }

    session.defaultSession.setPermissionCheckHandler(() => false)
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))

    registerIpc(() => mainWindow, finishClose)
    mainWindow = createWindow(settings.theme)
    watchDocs(mainWindow)
    initializeUpdater(() => mainWindow)

    // Automation hook: VDOC_SHOT=/path.png captures the window via the compositor
    // (no macOS screen-recording permission needed) and quits. VDOC_SHOT_DELAY_MS tunes the
    // wait; VDOC_SHOT_JS runs a script in the renderer (e.g. to select a file) 2.5s before capture.
    if (!app.isPackaged && process.env.VDOC_SHOT) {
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
