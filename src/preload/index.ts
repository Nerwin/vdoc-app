import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

import type { CheckProgress, VdocApi } from '../shared/types.ts'

const subscribe = <T>(channel: string, cb: (payload: T) => void): (() => void) => {
  const handler = (_event: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: VdocApi = {
  scan: () => ipcRenderer.invoke('scan'),
  checkAll: () => ipcRenderer.invoke('check-all'),
  checkFiles: paths => ipcRenderer.invoke('check-files', paths),
  readFile: path => ipcRenderer.invoke('read-file', path),
  diff: path => ipcRenderer.invoke('diff', path),
  pull: (paths, force) => ipcRenderer.invoke('pull', paths, force),
  push: (path, dryRun, force) => ipcRenderer.invoke('push', path, dryRun, force),
  create: (path, space, parent) => ipcRenderer.invoke('create', path, space, parent),
  sync: path => ipcRenderer.invoke('sync', path),
  lint: path => ipcRenderer.invoke('lint', path),
  authStatus: () => ipcRenderer.invoke('auth-status'),
  setToken: token => ipcRenderer.invoke('set-token', token),
  openConfluence: path => ipcRenderer.invoke('open-confluence', path),
  openEditor: path => ipcRenderer.invoke('open-editor', path),
  revealFinder: path => ipcRenderer.invoke('reveal-finder', path),
  settingsGet: () => ipcRenderer.invoke('settings-get'),
  settingsSet: patch => ipcRenderer.invoke('settings-set', patch),
  vdocVersion: () => ipcRenderer.invoke('vdoc-version'),
  onFilesChanged: cb => subscribe<string[]>('files-changed', cb),
  onCheckProgress: cb => subscribe<CheckProgress>('check-progress', cb),
}

contextBridge.exposeInMainWorld('vdoc', api)
