import { app, BrowserWindow, ipcMain, Notification } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createTray, destroyTray } from './tray'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 统一应用名，保证开发/打包后 userData 路径一致，设置才能持久化
app.setName('workbreak')

import { getSettings, setSettings, getSettingsFilePath, type AppSettings } from './settings'
import { startReminders, restartReminders, getReminderCountdowns } from './reminders'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  // 用手写CommonJS，避免 Vite 把 preload 打成 ESM；开发时从源码加载
  const preloadPath = resolve(__dirname, '../../src/preload/preload.cjs')
  const preloadExists = existsSync(preloadPath)
  if (!preloadExists) console.warn('[WorkBreak] preload 路径:', preloadPath, '不存在')

  mainWindow = new BrowserWindow({
    width: 800,
    height: 560,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // 部分环境下 sandbox 会导致 preload 无法注入
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools() // 开发时打开控制台，便于调试
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.executeJavaScript('typeof window.electronAPI')
        .then((t) => console.log('[WorkBreak] 页面加载后 window.electronAPI 类型:', t))
        .catch((e) => console.error('[WorkBreak] 检查 electronAPI 失败', e))
    })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('close', (e) => {
    e.preventDefault()
    mainWindow?.hide()
    if (Notification.isSupported()) {
      new Notification({
        title: 'WorkBreak',
        body: '已最小化到托盘。请点击任务栏右下角（时钟旁）的图标，或点击「↑」展开隐藏图标后找到 WorkBreak。',
      }).show()
    }
  })

  createTray(mainWindow)
}

;(globalThis as unknown as { workbreakQuit?: () => void }).workbreakQuit = () => {
  destroyTray()
  mainWindow = null
  app.quit()
}

// 只允许一个实例，避免重复点 bat 或 HMR 重建时弹出多窗口
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  createWindow()
  startReminders()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
  else mainWindow.show()
})

ipcMain.handle('getSettings', () => getSettings())
ipcMain.handle('getSettingsFilePath', () => getSettingsFilePath())
ipcMain.handle('setSettings', (_e, settings: Partial<AppSettings>) => {
  const path = getSettingsFilePath()
  console.log('[WorkBreak] setSettings 被调用，写入路径:', path)
  try {
    const next = setSettings(settings)
    restartReminders()
    console.log('[WorkBreak] 保存成功:', JSON.stringify(next))
    return { success: true as const, data: next }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[WorkBreak] 保存失败:', message)
    return { success: false as const, error: message }
  }
})
ipcMain.handle('showMainWindow', () => mainWindow?.show())
ipcMain.handle('getReminderCountdowns', () => getReminderCountdowns())
