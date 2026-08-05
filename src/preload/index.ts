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
  recordBaseline: path => ipcRenderer.invoke('record-baseline', path),
  lastVersion: path => ipcRenderer.invoke('last-version', path),
  comments: path => ipcRenderer.invoke('comments', path),
  postComment: (path, text) => ipcRenderer.invoke('post-comment', path, text),
  pull: (paths, force) => ipcRenderer.invoke('pull', paths, force),
  push: (path, dryRun, force) => ipcRenderer.invoke('push', path, dryRun, force),
  create: (path, space, parent) => ipcRenderer.invoke('create', path, space, parent),
  sync: path => ipcRenderer.invoke('sync', path),
  lint: path => ipcRenderer.invoke('lint', path),
  authStatus: () => ipcRenderer.invoke('auth-status'),
  setToken: token => ipcRenderer.invoke('set-token', token),
  saveApiKey: (email, apiToken) => ipcRenderer.invoke('save-api-key', email, apiToken),
  setAuthMethod: method => ipcRenderer.invoke('set-auth-method', method),
  openConfluence: path => ipcRenderer.invoke('open-confluence', path),
  openEditor: path => ipcRenderer.invoke('open-editor', path),
  revealFinder: path => ipcRenderer.invoke('reveal-finder', path),
  settingsGet: () => ipcRenderer.invoke('settings-get'),
  settingsSet: patch => ipcRenderer.invoke('settings-set', patch),
  vdocVersion: () => ipcRenderer.invoke('vdoc-version'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  openFolder: path => ipcRenderer.invoke('open-folder', path),
  onFilesChanged: cb => subscribe<string[]>('files-changed', cb),
  onCheckProgress: cb => subscribe<CheckProgress>('check-progress', cb),
}

contextBridge.exposeInMainWorld('vdoc', api)
