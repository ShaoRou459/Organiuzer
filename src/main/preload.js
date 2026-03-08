const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // Dialogs
  selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),

  // Settings
  getSettings: (key) => ipcRenderer.invoke('settings:get', key),
  getAllSettings: () => ipcRenderer.invoke('settings:getAll'),
  setSettings: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  // Folder operations
  scanFolder: (path) => ipcRenderer.invoke('folder:scan', path),
  analyzeFolder: (path, files, context) => ipcRenderer.invoke('folder:analyze', path, files, context),
  onAnalyzeStream: (callback) => {
    const listener = (_event, chunk) => callback(chunk);
    ipcRenderer.on('folder:analyze:stream', listener);
    return () => ipcRenderer.removeListener('folder:analyze:stream', listener);
  },
  onAnalyzeDone: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('folder:analyze:done', listener);
    return () => ipcRenderer.removeListener('folder:analyze:done', listener);
  },
  executeOrganization: (path, plan) => ipcRenderer.invoke('folder:execute', path, plan),
  onExecuteProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('folder:execute:progress', listener);
    return () => ipcRenderer.removeListener('folder:execute:progress', listener);
  },

  // Category folder lists (per directory path)
  getCategoryFolders: (path) => ipcRenderer.invoke('categories:get', path),
  setCategoryFolders: (path, folders) => ipcRenderer.invoke('categories:set', path, folders),
  getMetrics: () => ipcRenderer.invoke('metrics:get'),
  getHistory: () => ipcRenderer.invoke('history:get'),
  getRunHistory: () => ipcRenderer.invoke('history:runs:get'),
  revertRun: (runId) => ipcRenderer.invoke('folder:revert', runId),
});
