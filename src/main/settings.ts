import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { AppSettings, CategoryKind, ReminderCategory, SubReminder, PresetPools } from '../shared/settings'
import { getDefaultPresetPools, getStableDefaultCategories } from '../shared/settings'

export type { AppSettings, ReminderCategory, SubReminder } from '../shared/settings'

const defaultCategories = getStableDefaultCategories()
const defaultPresetPools = getDefaultPresetPools()
const legacyReminderContentDefaults = [
  '该休息一下啦',
  '起身活动一下',
  '喝口水，放松肩颈',
  '看看远处，放松眼睛',
  '本轮结束，预备下轮',
]
const legacyRestContentDefaults = [
  '休息一下，深呼吸',
  '离开屏幕，活动颈肩',
  '闭眼放松 30 秒',
  '休息即将结束，准备回来',
]

/** 旧版扁平设置（仅用于迁移检测与读取） */
interface LegacySettings {
  breakfastTime?: string
  lunchTime?: string
  dinnerTime?: string
  activityIntervalMinutes?: number
  workMinutes?: number
  breakMinutes?: number
  breakfastContent?: string
  lunchContent?: string
  dinnerContent?: string
  activityContent?: string
  restContent?: string
  mealPresets?: string[]
  activityPresets?: string[]
  restPresets?: string[]
}

function getDefaultCategoryName(kind: CategoryKind): string {
  return kind === 'alarm' ? '未命名闹钟类型' : kind === 'countdown' ? '未命名倒计时类型' : '未命名秒表类型'
}

function uniqStrings(input: unknown[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of input) {
    if (typeof v !== 'string') continue
    const s = v.trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

function hasLegacyFields(data: unknown): data is LegacySettings {
  if (!data || typeof data !== 'object') return false
  const o = data as Record<string, unknown>
  return (
    typeof o.breakfastTime === 'string' ||
    typeof o.activityIntervalMinutes === 'number' ||
    typeof o.workMinutes === 'number'
  )
}

/** 将旧版扁平配置转为 reminderCategories */
function migrateFromLegacy(legacy: LegacySettings): ReminderCategory[] {
  const cats = getStableDefaultCategories()
  const meal = cats[0]
  const activity = cats[1]
  const rest = cats[2]
  type FixedItem = Extract<SubReminder, { mode: 'fixed' }>
  type IntervalItem = Extract<SubReminder, { mode: 'interval' }>
  if (legacy.breakfastTime != null) {
    const cur = meal.items[0] as FixedItem
    meal.items[0] = { ...cur, mode: 'fixed', time: legacy.breakfastTime, content: legacy.breakfastContent ?? cur.content }
  }
  if (legacy.lunchTime != null) {
    const cur = meal.items[1] as FixedItem
    meal.items[1] = { ...cur, mode: 'fixed', time: legacy.lunchTime, content: legacy.lunchContent ?? cur.content }
  }
  if (legacy.dinnerTime != null) {
    const cur = meal.items[2] as FixedItem
    meal.items[2] = { ...cur, mode: 'fixed', time: legacy.dinnerTime, content: legacy.dinnerContent ?? cur.content }
  }
  if (Array.isArray(legacy.mealPresets)) meal.presets = legacy.mealPresets
  if (typeof legacy.activityIntervalMinutes === 'number') {
    const cur = activity.items[0] as IntervalItem
    activity.items[0] = {
      ...cur,
      mode: 'interval',
      intervalMinutes: Math.max(1, legacy.activityIntervalMinutes),
      content: legacy.activityContent ?? cur.content,
      repeatCount: null,
    }
  }
  if (Array.isArray(legacy.activityPresets)) activity.presets = legacy.activityPresets
  if (typeof legacy.workMinutes === 'number') {
    const cur = rest.items[0] as IntervalItem
    rest.items[0] = {
      ...cur,
      mode: 'interval',
      intervalMinutes: Math.max(1, legacy.workMinutes),
      content: legacy.restContent ?? cur.content,
      repeatCount: null,
    }
  }
  if (Array.isArray(legacy.restPresets)) rest.presets = legacy.restPresets
  return cats
}

function normalizeCategories(cats: unknown): ReminderCategory[] {
  // 缺字段或非数组：按「尚无有效配置」处理，用内置默认（首次安装等）
  if (!Array.isArray(cats)) return defaultCategories
  // 明确传空数组：允许用户清空所有类型，不得替换成默认（否则删光后会「秒恢复」模板）
  if (cats.length === 0) return []
  return cats.map((c) => {
    if (!c || typeof c !== 'object') return defaultCategories[0]
    const o = c as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : `cat_${Date.now()}`
    const rawName = typeof o.name === 'string' ? o.name : ''
    const presets = Array.isArray(o.presets) ? o.presets.filter((p): p is string => typeof p === 'string') : []
    const titlePresets = Array.isArray(o.titlePresets) ? o.titlePresets.filter((p): p is string => typeof p === 'string') : []
    const rawItems = Array.isArray(o.items) ? (o.items as unknown[]) : []
    const items: SubReminder[] = rawItems
      .map((item): SubReminder | null => {
      if (!item || typeof item !== 'object') return null
      const i = item as Record<string, unknown>
      if (typeof i.id !== 'string') return null
      if (i.mode === 'stopwatch') {
        return { id: i.id, mode: 'stopwatch' as const, ...(typeof i.content === 'string' && i.content ? { content: i.content } : {}) }
      }
      if (typeof i.content !== 'string') return null
      if (i.mode === 'fixed' && typeof (i as { time: unknown }).time === 'string') {
        const fixed = i as {
          startTime?: string
          time: string
          title?: unknown
          splitCount?: number
          restDurationSeconds?: number
          restContent?: string
          weekdaysEnabled?: unknown
        }
        let weekdaysEnabled: boolean[] | undefined
        if (Array.isArray(fixed.weekdaysEnabled) && fixed.weekdaysEnabled.length === 7) {
          weekdaysEnabled = fixed.weekdaysEnabled.map((x) => Boolean(x))
        }
        return {
          id: i.id,
          mode: 'fixed' as const,
          ...(typeof fixed.title === 'string' && fixed.title ? { title: fixed.title } : {}),
          ...(typeof i.enabled === 'boolean' ? { enabled: i.enabled } : { enabled: true }),
          ...(typeof fixed.startTime === 'string' && fixed.startTime ? { startTime: fixed.startTime } : {}),
          time: fixed.time,
          content: i.content as string,
          splitCount: fixed.splitCount,
          restDurationSeconds: fixed.restDurationSeconds,
          restContent: fixed.restContent,
          ...(weekdaysEnabled ? { weekdaysEnabled } : {}),
        }
      }
      if (i.mode === 'interval' && typeof (i as { intervalMinutes: unknown }).intervalMinutes === 'number') {
        const interval = i as { title?: unknown; intervalMinutes: number; intervalHours?: number; intervalSeconds?: number; repeatCount?: number | null; splitCount?: number; restDurationSeconds?: number; restContent?: string }
        const repeatCount = interval.repeatCount === undefined || interval.repeatCount === null
          ? null
          : Math.max(1, Math.floor(Number(interval.repeatCount)))
        return {
          id: i.id,
          mode: 'interval' as const,
          ...(typeof interval.title === 'string' && interval.title ? { title: interval.title } : {}),
          ...(typeof i.enabled === 'boolean' ? { enabled: i.enabled } : { enabled: true }),
          intervalHours: interval.intervalHours,
          intervalMinutes: interval.intervalMinutes,
          intervalSeconds: interval.intervalSeconds,
          content: i.content as string,
          repeatCount,
          splitCount: interval.splitCount,
          restDurationSeconds: interval.restDurationSeconds,
          restContent: interval.restContent,
        }
      }
      return null
    })
      .filter((x): x is SubReminder => x !== null)

    let categoryKind: CategoryKind =
      o.categoryKind === 'countdown'
        ? 'countdown'
        : o.categoryKind === 'stopwatch'
          ? 'stopwatch'
          : o.categoryKind === 'alarm'
            ? 'alarm'
            : 'alarm'
    if (o.categoryKind !== 'alarm' && o.categoryKind !== 'countdown' && o.categoryKind !== 'stopwatch') {
      const hasStopwatch = items.some((i) => i.mode === 'stopwatch')
      const hasInterval = items.some((i) => i.mode === 'interval')
      const hasFixed = items.some((i) => i.mode === 'fixed')
      if (hasStopwatch && !hasInterval && !hasFixed) categoryKind = 'stopwatch'
      else if (hasInterval && !hasFixed) categoryKind = 'countdown'
      else if (hasFixed && !hasInterval) categoryKind = 'alarm'
      else if (hasInterval && hasFixed) categoryKind = items[0]?.mode === 'interval' ? 'countdown' : 'alarm'
    }
    const filteredItems = items.filter((i) =>
      categoryKind === 'alarm'
        ? i.mode === 'fixed'
        : categoryKind === 'countdown'
          ? i.mode === 'interval'
          : i.mode === 'stopwatch'
    )
    const name = rawName.trim() || getDefaultCategoryName(categoryKind)
    return { id, name, categoryKind, presets, titlePresets, items: filteredItems }
  })
}

function normalizePresetPools(raw: unknown, categories: ReminderCategory[]): PresetPools {
  const categoryPresetsLegacy = uniqStrings(categories.flatMap((c) => c.presets ?? []))
  const restPresetsLegacy = uniqStrings(
    categories.flatMap((c) =>
      c.items.flatMap((i) =>
        i.mode === 'fixed' || i.mode === 'interval'
          ? (typeof i.restContent === 'string' && i.restContent.trim() ? [i.restContent] : [])
          : []
      )
    )
  )
  const base = {
    categoryTitle: { ...defaultPresetPools.categoryTitle },
    subTitle: { ...defaultPresetPools.subTitle },
    reminderContent: categoryPresetsLegacy.length > 0 ? categoryPresetsLegacy : [...defaultPresetPools.reminderContent],
    restContent: restPresetsLegacy.length > 0 ? restPresetsLegacy : [...defaultPresetPools.restContent],
  }
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  const categoryTitle = (o.categoryTitle ?? {}) as Record<string, unknown>
  const subTitle = (o.subTitle ?? {}) as Record<string, unknown>
  const reminderContentRaw = Array.isArray(o.reminderContent) ? uniqStrings(o.reminderContent) : base.reminderContent
  const restContentRaw = Array.isArray(o.restContent) ? uniqStrings(o.restContent) : base.restContent
  const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])
  const reminderContent = sameList(reminderContentRaw, legacyReminderContentDefaults)
    ? [...defaultPresetPools.reminderContent]
    : reminderContentRaw
  const restContent = sameList(restContentRaw, legacyRestContentDefaults)
    ? [...defaultPresetPools.restContent]
    : restContentRaw
  return {
    categoryTitle: {
      alarm: Array.isArray(categoryTitle.alarm) ? uniqStrings(categoryTitle.alarm as unknown[]) : base.categoryTitle.alarm,
      countdown: Array.isArray(categoryTitle.countdown) ? uniqStrings(categoryTitle.countdown as unknown[]) : base.categoryTitle.countdown,
      stopwatch: Array.isArray(categoryTitle.stopwatch) ? uniqStrings(categoryTitle.stopwatch as unknown[]) : base.categoryTitle.stopwatch,
    },
    subTitle: {
      fixed: Array.isArray(subTitle.fixed) ? uniqStrings(subTitle.fixed as unknown[]) : base.subTitle.fixed,
      interval: Array.isArray(subTitle.interval) ? uniqStrings(subTitle.interval as unknown[]) : base.subTitle.interval,
      stopwatch: Array.isArray(subTitle.stopwatch) ? uniqStrings(subTitle.stopwatch as unknown[]) : base.subTitle.stopwatch,
    },
    reminderContent,
    restContent,
  }
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
    return { reminderCategories: defaultCategories, presetPools: defaultPresetPools }
  }
  try {
    const raw = readFileSync(path, 'utf-8')
    const data = JSON.parse(raw) as Record<string, unknown>
    if (hasLegacyFields(data) && (!Array.isArray(data.reminderCategories) || data.reminderCategories.length === 0)) {
      const migrated = migrateFromLegacy(data)
      const next: AppSettings = {
        reminderCategories: migrated,
        presetPools: normalizePresetPools(data.presetPools, migrated),
      }
      const dir = dirname(path)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(path, JSON.stringify(next, null, 2), 'utf-8')
      if (process.env.VITE_DEV_SERVER_URL) console.log('[WorkBreak] 已迁移旧配置为新结构:', path)
      return next
    }
    const normalizedCategories = normalizeCategories(data.reminderCategories)
    const out: AppSettings = {
      reminderCategories: normalizedCategories,
      presetPools: normalizePresetPools(data.presetPools, normalizedCategories),
    }
    if (process.env.VITE_DEV_SERVER_URL) console.log('[WorkBreak] 已读取设置:', path)
    return out
  } catch (e) {
    if (process.env.VITE_DEV_SERVER_URL) console.warn('[WorkBreak] 读取设置失败', e)
    return { reminderCategories: defaultCategories, presetPools: defaultPresetPools }
  }
}

export function setSettings(settings: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const next: AppSettings = {
    reminderCategories: settings.reminderCategories !== undefined
      ? normalizeCategories(settings.reminderCategories)
      : current.reminderCategories,
    presetPools: settings.presetPools !== undefined
      ? normalizePresetPools(settings.presetPools, settings.reminderCategories !== undefined ? normalizeCategories(settings.reminderCategories) : current.reminderCategories)
      : current.presetPools,
  }
  const path = getSettingsPath()
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(next, null, 2), 'utf-8')
  return next
}
