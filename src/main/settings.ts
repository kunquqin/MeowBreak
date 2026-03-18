import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

export interface AppSettings {
  /** 早餐提醒时间 "HH:mm" */
  breakfastTime: string
  /** 午餐提醒时间 "HH:mm" */
  lunchTime: string
  /** 晚餐提醒时间 "HH:mm" */
  dinnerTime: string
  /** 活动提醒间隔（分钟） */
  activityIntervalMinutes: number
  /** 工作时长（分钟），到点后提醒休息 */
  workMinutes: number
  /** 休息时长（分钟） */
  breakMinutes: number
}

const defaults: AppSettings = {
  breakfastTime: '08:00',
  lunchTime: '12:00',
  dinnerTime: '18:00',
  activityIntervalMinutes: 45,
  workMinutes: 25,
  breakMinutes: 5,
}

/** 开发时写到项目根目录，便于确认；正式用 userData */
function getSettingsPath(): string {
  const isDev = !!process.env.VITE_DEV_SERVER_URL
  if (isDev) {
    return join(process.cwd(), 'workbreak-settings.json')
  }
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettingsFilePath(): string {
  return getSettingsPath()
}

export function getSettings(): AppSettings {
  const path = getSettingsPath()
  if (!existsSync(path)) {
    if (process.env.VITE_DEV_SERVER_URL) console.log('[WorkBreak] 设置文件不存在，使用默认值。路径:', path)
    return { ...defaults }
  }
  try {
    const raw = readFileSync(path, 'utf-8')
    const data = JSON.parse(raw) as Partial<AppSettings>
    const out = { ...defaults, ...data }
    if (process.env.VITE_DEV_SERVER_URL) console.log('[WorkBreak] 已读取设置:', path, JSON.stringify(out))
    return out
  } catch (e) {
    if (process.env.VITE_DEV_SERVER_URL) console.warn('[WorkBreak] 读取设置失败', e)
    return { ...defaults }
  }
}

export function setSettings(settings: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const next = { ...current, ...settings }
  const path = getSettingsPath()
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(next, null, 2), 'utf-8')
  return next
}
