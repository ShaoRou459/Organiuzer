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
  analyzeFolder: (path, files) => ipcRenderer.invoke('folder:analyze', path, files),
  executeOrganization: (path, plan) => ipcRenderer.invoke('folder:execute', path, plan),
});
