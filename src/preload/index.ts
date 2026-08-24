import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

import type { CheckProgress, VdocApi, VdocLogEntry } from '../shared/types.ts'

const subscribe = <T>(channel: string, cb: (payload: T) => void): (() => void) => {
  const handler = (_event: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: VdocApi = {
  scan: () => ipcRenderer.invoke('scan'),
  checkAll: () => ipcRenderer.invoke('check-all'),
  checkCancel: () => ipcRenderer.invoke('check-cancel'),
  checkFiles: paths => ipcRenderer.invoke('check-files', paths),
  readFile: path => ipcRenderer.invoke('read-file', path),
  writeFile: (path, content) => ipcRenderer.invoke('write-file', path, content),
  backlinks: path => ipcRenderer.invoke('backlinks', path),
  searchContent: query => ipcRenderer.invoke('search-content', query),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  diff: path => ipcRenderer.invoke('diff', path),
  recordBaseline: path => ipcRenderer.invoke('record-baseline', path),
  lastVersion: path => ipcRenderer.invoke('last-version', path),
  comments: path => ipcRenderer.invoke('comments', path),
  postComment: (path, text) => ipcRenderer.invoke('post-comment', path, text),
  labels: path => ipcRenderer.invoke('labels', path),
  pull: (paths, force) => ipcRenderer.invoke('pull', paths, force),
  push: (path, dryRun, force) => ipcRenderer.invoke('push', path, dryRun, force),
  create: (path, space, parent) => ipcRenderer.invoke('create', path, space, parent),
  getPage: (input, dir) => ipcRenderer.invoke('get-page', input, dir),
  fileForPageId: pageId => ipcRenderer.invoke('file-for-page-id', pageId),
  sync: (path, space) => ipcRenderer.invoke('sync', path, space),
  lint: path => ipcRenderer.invoke('lint', path),
  authStatus: () => ipcRenderer.invoke('auth-status'),
  setToken: token => ipcRenderer.invoke('set-token', token),
  saveApiKey: (email, apiToken) => ipcRenderer.invoke('save-api-key', email, apiToken),
  setAuthMethod: method => ipcRenderer.invoke('set-auth-method', method),
  credentialPreview: key => ipcRenderer.invoke('credential-preview', key),
  clearCredential: key => ipcRenderer.invoke('credential-clear', key),
  confluenceUrl: path => ipcRenderer.invoke('confluence-url', path),
  openEditor: path => ipcRenderer.invoke('open-editor', path),
  revealFinder: path => ipcRenderer.invoke('reveal-finder', path),
  settingsGet: () => ipcRenderer.invoke('settings-get'),
  settingsSet: patch => ipcRenderer.invoke('settings-set', patch),
  setAssetsDir: dir => ipcRenderer.invoke('set-assets-dir', dir),
  setSite: site => ipcRenderer.invoke('set-site', site),
  vdocVersion: () => ipcRenderer.invoke('vdoc-version'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickDocsRoot: () => ipcRenderer.invoke('pick-docs-root'),
  openFolder: path => ipcRenderer.invoke('open-folder', path),
  spaceMappingGet: () => ipcRenderer.invoke('space-mapping-get'),
  spaceMappingSet: (dir, space) => ipcRenderer.invoke('space-mapping-set', dir, space),
  revealConfig: () => ipcRenderer.invoke('reveal-config'),
  editConfig: () => ipcRenderer.invoke('edit-config'),
  quit: () => ipcRenderer.invoke('quit'),
  logs: () => ipcRenderer.invoke('vdoc-logs'),
  onFilesChanged: cb => subscribe<string[]>('files-changed', cb),
  onCheckProgress: cb => subscribe<CheckProgress>('check-progress', cb),
  onVdocLog: cb => subscribe<VdocLogEntry>('vdoc-log', cb),
}

contextBridge.exposeInMainWorld('vdoc', api)
