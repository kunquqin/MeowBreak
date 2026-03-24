/// <reference types="vite/client" />

import type { AppSettings, CountdownItem, PopupTheme } from './types'

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
      getPrimaryDisplaySize: () => Promise<{ width: number; height: number }>
      getReminderCountdowns: () => Promise<CountdownItem[]>
      resetReminderProgress: (key: string, payload?: import('./types').ResetIntervalPayload) => Promise<void>
      setFixedTimeCountdownOverride: (key: string, time: string) => Promise<void>
      resetAllReminderProgress: () => Promise<void>
      restartReminders: () => Promise<void>
      resolvePreviewImageUrl: (imagePath: string) => Promise<
        { success: true; url: string } | { success: false; error: string }
      >
      pickPopupImageFile: () => Promise<
        { success: true; path: string } | { success: false; error: string }
      >
      pickPopupImageFolder: () => Promise<
        { success: true; folderPath: string; files: string[] } | { success: false; error: string }
      >
      getSystemFontFamilies: () => Promise<
        { success: true; fonts: string[] } | { success: false; fonts: string[]; error: string }
      >
      clearSystemFontListCache: () => Promise<void>
      startDesktopLiveWallpaper: (
        theme: PopupTheme,
      ) => Promise<
        | { success: true }
        | { success: false; error: string }
        | { pending: true; requestId: number }
      >
      /** 与 `start` 返回的 `requestId` 配对，过滤乱序/过期的完成事件 */
      waitDesktopLiveWallpaperApplyDone: (
        requestId: number,
      ) => Promise<{ success: true } | { success: false; error: string }>
      stopDesktopLiveWallpaper: () => Promise<{ success: true }>;
      isDesktopLiveWallpaperActive: () => Promise<boolean>;
      getDesktopLiveWallpaperState: () => Promise<{ active: boolean; themeId: string | null }>;
      onMenuUndo?: (cb: () => void) => () => void
      onMenuRedo?: (cb: () => void) => () => void
    }
  }
}

export {}
