/**
 * 提醒相关类型与默认值，主进程与渲染进程共用。
 */

/** 大类下仅允许一种子项：闹钟 / 倒计时 / 秒表（无提醒弹窗，仅界面计时） */
export type CategoryKind = 'alarm' | 'countdown' | 'stopwatch'

/** 拆分与中间休息（闹钟、倒计时均可选） */
export interface SplitRestOptions {
  /** 拆成几份，默认 1 表示不拆分 */
  splitCount?: number
  /** 中间休息时长（秒），0 表示无休息 */
  restDurationSeconds?: number
  /** 休息时弹窗文案 */
  restContent?: string
}

/** 子提醒：闹钟 / 倒计时 / 秒表（无 content、无提醒） */
export type SubReminder =
  | ({ id: string; mode: 'fixed'; time: string; content: string } & SplitRestOptions)
  | ({ id: string; mode: 'interval'; intervalHours?: number; intervalMinutes: number; intervalSeconds?: number; content: string; repeatCount: number | null } & SplitRestOptions)
  | { id: string; mode: 'stopwatch' }

/** 提醒类型（用户可增删），下含多个子提醒；categoryKind 决定仅闹钟或仅倒计时子项 */
export interface ReminderCategory {
  id: string
  name: string
  /** 闹钟仅 fixed；倒计时仅 interval；秒表仅 stopwatch */
  categoryKind: CategoryKind
  presets: string[]
  items: SubReminder[]
}

export interface AppSettings {
  reminderCategories: ReminderCategory[]
}

/** 重置进度时由渲染进程传入的当前间隔配置（可与磁盘不一致），主进程优先使用 */
export interface ResetIntervalPayload {
  categoryName: string
  content: string
  intervalHours?: number
  intervalMinutes: number
  intervalSeconds?: number
  repeatCount: number | null
  splitCount?: number
  restDurationSeconds?: number
  restContent?: string
}

/** 设置页倒计时展示用，由主进程 getReminderCountdowns 返回。拆分时附带 phase 信息用于多段进度条。 */
export interface CountdownItem {
  key: string
  type: 'fixed' | 'interval'
  nextAt: number
  remainingMs: number
  time?: string
  repeatCount?: number | null
  firedCount?: number
  /** 拆分份数，>1 时有多段进度 */
  splitCount?: number
  /** 每段工作时长（毫秒） */
  segmentDurationMs?: number
  /** 中间休息时长（毫秒），0 不显示蓝条 */
  restDurationMs?: number
  /** 当前阶段 work | rest */
  currentPhase?: 'work' | 'rest'
  /** 当前阶段索引（工作 0..splitCount-1，休息 0..splitCount-2） */
  phaseIndex?: number
  /** 当前阶段已过时间（毫秒） */
  phaseElapsedMs?: number
  /** 当前阶段总时长（毫秒） */
  phaseTotalMs?: number
  /** 整轮总时长（毫秒），用于进度条总长 */
  cycleTotalMs?: number
  /** 仅工作段剩余时间（毫秒），不含休息；用于倒计时显示，与用户设置的「倒计时」一致 */
  workRemainingMs?: number
  /** 本周期起始时间戳；固定时间在「重置」后由主进程设为当前时刻，用于进度条/沙漏从新起点计算 */
  cycleStartAt?: number
}

function genId(): string {
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

const defaultMealPresets = ['记得吃早餐哦～', '该吃午饭啦，休息一下～', '记得吃晚饭～', '按时吃饭，身体棒棒']
const defaultActivityPresets = ['坐太久啦，站起来动一动、看看远处吧～', '活动一下，伸个懒腰吧', '喝杯水，走一走']
const defaultRestPresets = ['已经工作一段时间了，休息一下吧～', '休息一下，眼睛看看远处', '喝杯水再继续']

/** 默认提醒分类（对应原吃饭/活动/休息） */
export function getDefaultReminderCategories(): ReminderCategory[] {
  return [
    {
      id: genId(),
      name: '吃饭',
      categoryKind: 'alarm',
      presets: [...defaultMealPresets],
      items: [
        { id: genId(), mode: 'fixed', time: '08:00', content: defaultMealPresets[0] },
        { id: genId(), mode: 'fixed', time: '12:00', content: defaultMealPresets[1] },
        { id: genId(), mode: 'fixed', time: '18:00', content: defaultMealPresets[2] },
      ],
    },
    {
      id: genId(),
      name: '活动',
      categoryKind: 'countdown',
      presets: [...defaultActivityPresets],
      items: [
        { id: genId(), mode: 'interval', intervalMinutes: 45, content: defaultActivityPresets[0], repeatCount: null },
      ],
    },
    {
      id: genId(),
      name: '休息',
      categoryKind: 'countdown',
      presets: [...defaultRestPresets],
      items: [
        { id: genId(), mode: 'interval', intervalMinutes: 25, content: defaultRestPresets[0], repeatCount: null },
      ],
    },
  ]
}

/** 生成稳定默认值（用于迁移或空配置），id 用固定前缀便于测试 */
export function getStableDefaultCategories(): ReminderCategory[] {
  return [
    {
      id: 'cat_meal',
      name: '吃饭',
      categoryKind: 'alarm',
      presets: [...defaultMealPresets],
      items: [
        { id: 'meal_breakfast', mode: 'fixed', time: '08:00', content: defaultMealPresets[0] },
        { id: 'meal_lunch', mode: 'fixed', time: '12:00', content: defaultMealPresets[1] },
        { id: 'meal_dinner', mode: 'fixed', time: '18:00', content: defaultMealPresets[2] },
      ],
    },
    {
      id: 'cat_activity',
      name: '活动',
      categoryKind: 'countdown',
      presets: [...defaultActivityPresets],
      items: [
        { id: 'activity_1', mode: 'interval', intervalMinutes: 45, content: defaultActivityPresets[0], repeatCount: null },
      ],
    },
    {
      id: 'cat_rest',
      name: '休息',
      categoryKind: 'countdown',
      presets: [...defaultRestPresets],
      items: [
        { id: 'rest_1', mode: 'interval', intervalMinutes: 25, content: defaultRestPresets[0], repeatCount: null },
      ],
    },
  ]
}

export { genId }
