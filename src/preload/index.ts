import { contextBridge, ipcRenderer } from 'electron'

export interface AppSettings {
  breakfastTime: string
  lunchTime: string
  dinnerTime: string
  activityIntervalMinutes: number
  workMinutes: number
  breakMinutes: number
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('getSettings') as Promise<AppSettings>,
  getSettingsFilePath: () => ipcRenderer.invoke('getSettingsFilePath') as Promise<string>,
  setSettings: (settings: Partial<AppSettings>) =>
    ipcRenderer.invoke('setSettings', settings) as Promise<
      { success: true; data: AppSettings } | { success: false; error: string }
    >,
  showMainWindow: () => ipcRenderer.invoke('showMainWindow'),
})
