import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

import type { AppUpdateStatus, CheckProgress, VdocApi, VdocLogEntry } from '../shared/types.ts'

const subscribe = <T>(channel: string, cb: (payload: T) => void): (() => void) => {
  const handler = (_event: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: VdocApi = {
  platform: process.platform as VdocApi['platform'],
  scan: () => ipcRenderer.invoke('scan'),
  checkAll: () => ipcRenderer.invoke('check-all'),
  checkCancel: () => ipcRenderer.invoke('check-cancel'),
  checkFiles: paths => ipcRenderer.invoke('check-files', paths),
  readFile: path => ipcRenderer.invoke('read-file', path),
  writeFile: request => ipcRenderer.invoke('write-file', request),
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
  previewPush: (path, force, allowLossy) => ipcRenderer.invoke('push-preview', path, force, allowLossy),
  commitPush: token => ipcRenderer.invoke('push-commit', token),
  create: (path, space, parent) => ipcRenderer.invoke('create', path, space, parent),
  initFile: path => ipcRenderer.invoke('md-init', path),
  getPage: (input, dir) => ipcRenderer.invoke('get-page', input, dir),
  fileForPageId: pageId => ipcRenderer.invoke('file-for-page-id', pageId),
  sync: (path, space) => ipcRenderer.invoke('sync', path, space),
  lint: path => ipcRenderer.invoke('lint', path),
  authStatus: () => ipcRenderer.invoke('auth-status'),
  setToken: token => ipcRenderer.invoke('set-token', token),
  saveApiKey: apiToken => ipcRenderer.invoke('save-api-key', apiToken),
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
  updateStatus: () => ipcRenderer.invoke('update-status'),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  sentryActive: () => ipcRenderer.invoke('sentry-active'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickDocsRoot: () => ipcRenderer.invoke('pick-docs-root'),
  openFolder: path => ipcRenderer.invoke('open-folder', path),
  spaceMappingGet: () => ipcRenderer.invoke('space-mapping-get'),
  spaceMappingSet: (dir, space) => ipcRenderer.invoke('space-mapping-set', dir, space),
  revealConfig: () => ipcRenderer.invoke('reveal-config'),
  editConfig: () => ipcRenderer.invoke('edit-config'),
  closeReady: saved => ipcRenderer.invoke('close-ready', saved),
  quit: () => ipcRenderer.invoke('quit'),
  logs: () => ipcRenderer.invoke('vdoc-logs'),
  copyText: text => ipcRenderer.invoke('clipboard-write', text),
  onFilesChanged: cb => subscribe<string[]>('files-changed', cb),
  onCheckProgress: cb => subscribe<CheckProgress>('check-progress', cb),
  onUpdateStatus: cb => subscribe<AppUpdateStatus>('update-status', cb),
  onVdocLog: cb => subscribe<VdocLogEntry>('vdoc-log', cb),
  onCloseRequested: cb => subscribe('close-requested', cb),
}

contextBridge.exposeInMainWorld('vdoc', api)
