const { contextBridge, ipcRenderer, webUtils } = require('electron');

/** Subscribe to a main-process event; returns an unsubscribe function. */
const subscribe = (channel, map = (...args) => args[0]) => (callback) => {
  const listener = (_event, ...args) => callback(map(...args));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizedChange: subscribe('window:maximized-changed'),

  // Dialogs + shell
  selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  isDirectory: (path) => ipcRenderer.invoke('fs:isDirectory', path),
  openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
  showItemInFolder: (path) => ipcRenderer.invoke('shell:showItem', path),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // App
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  checkForUpdate: () => ipcRenderer.invoke('app:checkUpdate'),

  // Settings (the API key never leaves the main process; only a hint is returned)
  getSettings: (key) => ipcRenderer.invoke('settings:get', key),
  getAllSettings: () => ipcRenderer.invoke('settings:getAll'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  testAiConnection: (overrides) => ipcRenderer.invoke('ai:test', overrides),

  // Folder operations
  scanFolder: (path, opts) => ipcRenderer.invoke('folder:scan', path, opts),
  analyzeFolder: (path, files, context) => ipcRenderer.invoke('folder:analyze', path, files, context),
  cancelAnalyze: () => ipcRenderer.invoke('folder:analyze:cancel'),
  onAnalyzeStream: subscribe('folder:analyze:stream'),
  onAnalyzeDone: subscribe('folder:analyze:done', () => undefined),
  executeOrganization: (path, plan) => ipcRenderer.invoke('folder:execute', path, plan),
  onExecuteProgress: subscribe('folder:execute:progress'),

  // File utilities
  findDuplicates: (path, recursive, requestId) => ipcRenderer.invoke('folder:findDuplicates', path, recursive, requestId),
  cancelFindDuplicates: () => ipcRenderer.invoke('folder:findDuplicates:cancel'),
  onDuplicateProgress: subscribe('folder:findDuplicates:progress'),
  findRenameCandidates: (path) => ipcRenderer.invoke('folder:rename:candidates', path),
  suggestRenames: (path, ids, requestId, options) => ipcRenderer.invoke('folder:rename:suggest', path, ids, requestId, options),
  namePreparedDocuments: (path, ids, requestId) => ipcRenderer.invoke('folder:rename:ai', path, ids, requestId),
  cancelRenameSuggestions: () => ipcRenderer.invoke('folder:rename:cancel'),
  applyRenames: (path, selected) => ipcRenderer.invoke('folder:rename:apply', path, selected),
  onRenameProgress: subscribe('folder:rename:progress'),
  deleteFiles: (dirPath, files) => ipcRenderer.invoke('folder:deleteFiles', dirPath, files),
  findDocumentVersions: (path, requestId) => ipcRenderer.invoke('documents:versions:scan', path, requestId),
  cancelDocumentVersions: () => ipcRenderer.invoke('documents:versions:cancel'),
  recycleDocumentVersions: (path, scanId, selectedIds) => ipcRenderer.invoke('documents:versions:recycle', path, scanId, selectedIds),
  compareDocumentVersions: (path, scanId, leftId, rightId) => ipcRenderer.invoke('documents:versions:compare', path, scanId, leftId, rightId),
  onDocumentVersionProgress: subscribe('documents:versions:progress'),
  searchDocuments: (path, query, requestId) => ipcRenderer.invoke('documents:search', path, query, requestId),
  cancelDocumentSearch: () => ipcRenderer.invoke('documents:search:cancel'),
  onDocumentSearchProgress: subscribe('documents:search:progress'),
  getCleanupPresets: (path) => ipcRenderer.invoke('presets:get', path),
  saveCleanupPreset: (path, preset) => ipcRenderer.invoke('presets:save', path, preset),
  previewCleanupPreset: (path, preset) => ipcRenderer.invoke('presets:preview', path, preset),

  // Category folder lists (per directory path)
  getCategoryFolders: (path) => ipcRenderer.invoke('categories:get', path),
  setCategoryFolders: (path, folders) => ipcRenderer.invoke('categories:set', path, folders),

  // Recent folders, metrics, history
  getRecentFolders: () => ipcRenderer.invoke('folders:recent:get'),
  addRecentFolder: (path) => ipcRenderer.invoke('folders:recent:add', path),
  getMetrics: () => ipcRenderer.invoke('metrics:get'),
  getHistory: () => ipcRenderer.invoke('history:get'),
  getRunHistory: () => ipcRenderer.invoke('history:runs:get'),
  revertRun: (runId) => ipcRenderer.invoke('folder:revert', runId),
});
