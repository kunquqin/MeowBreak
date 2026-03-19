/// <reference types="vite/client" />

import type { AppSettings, CountdownItem } from './types'

declare global {
  interface Window {
    electronAPI?: {
      platform: string
      getSettings: () => Promise<AppSettings>
      getSettingsFilePath: () => Promise<string>
      setSettings: (settings: Partial<AppSettings>) => Promise<
        { success: true; data: AppSettings } | { success: false; error: string }
      >
      showMainWindow: () => void
      getReminderCountdowns: () => Promise<CountdownItem[]>
      resetReminderProgress: (key: string, payload?: import('./types').ResetIntervalPayload) => Promise<void>
      setFixedTimeCountdownOverride: (key: string, time: string) => Promise<void>
      resetAllReminderProgress: () => Promise<void>
      restartReminders: () => Promise<void>
    }
  }
}

export {}
