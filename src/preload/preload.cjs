const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('getSettings'),
  getSettingsFilePath: () => ipcRenderer.invoke('getSettingsFilePath'),
  setSettings: (settings) => ipcRenderer.invoke('setSettings', settings),
  showMainWindow: () => ipcRenderer.invoke('showMainWindow'),
  getReminderCountdowns: () => ipcRenderer.invoke('getReminderCountdowns'),
})
