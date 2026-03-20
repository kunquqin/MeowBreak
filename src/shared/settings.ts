/**
 * 提醒相关类型与默认值，主进程与渲染进程共用。
 */

/** 大类下仅允许一种子项：闹钟 / 倒计时 / 秒表（无提醒弹窗，仅界面计时） */
export type CategoryKind = 'alarm' | 'countdown' | 'stopwatch'
export type SubReminderMode = 'fixed' | 'interval' | 'stopwatch'

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
  | ({
      id: string
      mode: 'fixed'
      /** 子项标题（仅用于列表展示） */
      title?: string
      /** 开关状态：true=启用，false=关闭 */
      enabled?: boolean
      time: string
      content: string
      /** 与 Date.getDay() 一致：0=周日…6=周六；缺省表示每天均重复（兼容旧配置） */
      weekdaysEnabled?: boolean[]
    } & SplitRestOptions)
  | ({ id: string; mode: 'interval'; title?: string; enabled?: boolean; intervalHours?: number; intervalMinutes: number; intervalSeconds?: number; content: string; repeatCount: number | null } & SplitRestOptions)
  | { id: string; mode: 'stopwatch'; content?: string }

/** 提醒类型（用户可增删），下含多个子提醒；categoryKind 决定仅闹钟或仅倒计时子项 */
export interface ReminderCategory {
  id: string
  name: string
  /** 闹钟仅 fixed；倒计时仅 interval；秒表仅 stopwatch */
  categoryKind: CategoryKind
  /** 弹窗文案预设 */
  presets: string[]
  /** 标题预设 */
  titlePresets: string[]
  items: SubReminder[]
}

export interface AppSettings {
  reminderCategories: ReminderCategory[]
  presetPools: PresetPools
}

export interface PresetPools {
  /** 大类标题预设：按闹钟/倒计时/秒表分池，互不相通 */
  categoryTitle: Record<CategoryKind, string[]>
  /** 子项标题预设：按闹钟/倒计时/秒表分池，互不相通 */
  subTitle: Record<SubReminderMode, string[]>
  /** 主弹窗文案预设：闹钟 + 倒计时共享 */
  reminderContent: string[]
  /** 休息弹窗文案预设：拆分休息共享，且与主弹窗文案隔离 */
  restContent: string[]
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
  /** 当前周期已结束（如 fixed 单次已触发、interval 达到重复次数） */
  ended?: boolean
  time?: string
  repeatCount?: number | null
  firedCount?: number
  /** 拆分份数，>1 时有多段进度 */
  splitCount?: number
  /** 每段工作时长（毫秒） */
  segmentDurationMs?: number
  /** 每段工作时长列表（毫秒），支持“总时长扣除休息后均分”产生的不等长段 */
  workDurationsMs?: number[]
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

export function getDefaultPresetPools(): PresetPools {
  return {
    categoryTitle: {
      alarm: ['用餐提醒', '作息提醒', '通勤提醒'],
      countdown: ['久坐活动', '专注节奏', '健康打卡'],
      stopwatch: ['专注计时', '任务计时', '训练计时'],
    },
    subTitle: {
      fixed: ['早餐', '午餐', '晚餐', '下班准备', '睡前放松'],
      interval: ['喝水', '起身活动', '远眺护眼', '专注一轮', '复盘整理'],
      stopwatch: ['代码冲刺', '会议计时', '阅读计时', '训练组间', '自定义计时'],
    },
    reminderContent: [
      '起床',
      '上班',
      '下班',
      '吃饭',
      '睡觉',
      '时间到',
    ],
    restContent: [
      '休息一下',
      '起来走走',
      '活动身子',
      '放松眼睛',
      '伸个懒腰',
    ],
  }
}

/** 默认提醒分类（对应原吃饭/活动/休息） */
export function getDefaultReminderCategories(): ReminderCategory[] {
  return [
    {
      id: genId(),
      name: '吃饭',
      categoryKind: 'alarm',
      presets: [...defaultMealPresets],
      titlePresets: [],
      items: [
        { id: genId(), mode: 'fixed', enabled: true, time: '08:00', content: defaultMealPresets[0] },
        { id: genId(), mode: 'fixed', enabled: true, time: '12:00', content: defaultMealPresets[1] },
        { id: genId(), mode: 'fixed', enabled: true, time: '18:00', content: defaultMealPresets[2] },
      ],
    },
    {
      id: genId(),
      name: '活动',
      categoryKind: 'countdown',
      presets: [...defaultActivityPresets],
      titlePresets: [],
      items: [
        { id: genId(), mode: 'interval', enabled: true, intervalMinutes: 45, content: defaultActivityPresets[0], repeatCount: null },
      ],
    },
    {
      id: genId(),
      name: '休息',
      categoryKind: 'countdown',
      presets: [...defaultRestPresets],
      titlePresets: [],
      items: [
        { id: genId(), mode: 'interval', enabled: true, intervalMinutes: 25, content: defaultRestPresets[0], repeatCount: null },
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
      titlePresets: [],
      items: [
        { id: 'meal_breakfast', mode: 'fixed', enabled: true, time: '08:00', content: defaultMealPresets[0] },
        { id: 'meal_lunch', mode: 'fixed', enabled: true, time: '12:00', content: defaultMealPresets[1] },
        { id: 'meal_dinner', mode: 'fixed', enabled: true, time: '18:00', content: defaultMealPresets[2] },
      ],
    },
    {
      id: 'cat_activity',
      name: '活动',
      categoryKind: 'countdown',
      presets: [...defaultActivityPresets],
      titlePresets: [],
      items: [
        { id: 'activity_1', mode: 'interval', enabled: true, intervalMinutes: 45, content: defaultActivityPresets[0], repeatCount: null },
      ],
    },
    {
      id: 'cat_rest',
      name: '休息',
      categoryKind: 'countdown',
      presets: [...defaultRestPresets],
      titlePresets: [],
      items: [
        { id: 'rest_1', mode: 'interval', enabled: true, intervalMinutes: 25, content: defaultRestPresets[0], repeatCount: null },
      ],
    },
  ]
}

export { genId }
