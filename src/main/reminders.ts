import { getSettings } from './settings'
import type { ReminderCategory, SubReminder } from './settings'
import type { ResetIntervalPayload } from '../shared/settings'
import { showReminderPopup, showRestEndCountdownPopup } from './reminderWindow'
import { buildSplitSchedule } from '../shared/splitSchedule'

const REMINDER_LOG = true
function reminderLog(...args: unknown[]) {
  if (REMINDER_LOG) console.log('[WorkBreak][Reminder]', ...args)
}

let fixedMinuteTimeout: ReturnType<typeof setTimeout> | null = null
const intervalTimerKeys: string[] = []
const intervalTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
interface IntervalCompletedState {
  completedAt: number
  repeatCount: number
  firedCount: number
  splitCount: number
  segmentDurationMs: number
  workDurationsMs: number[]
  restDurationMs: number
  cycleTotalMs: number
}
interface IntervalState {
  startTime: number
  firedCount: number
  intervalMs: number
  repeatCount: number | null
  categoryName: string
  content: string
  /** 拆分份数，1 表示不拆分 */
  splitCount: number
  /** 每段工作时长（毫秒） */
  segmentDurationMs: number
  /** 每段工作时长列表（支持余数分配） */
  workDurationsMs: number[]
  /** 中间休息时长（毫秒），0 表示无 */
  restDurationMs: number
  /** 整轮总时长（工作+休息） */
  cycleTotalMs: number
  /** 休息弹窗文案 */
  restContent: string
  /** 当前阶段 work | rest */
  phase: 'work' | 'rest'
  /** 当前阶段索引 */
  phaseIndex: number
  /** 当前阶段开始时间戳 */
  phaseStartTime: number
}
const intervalState = new Map<string, IntervalState>()
const intervalCompletedState = new Map<string, IntervalCompletedState>()
/** 休息结束倒计时弹窗的 setTimeout 句柄，随休息段生命周期清理 */
const restEndCountdownTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

/** 固定时间倒计时覆盖：key -> HH:mm，用于「重置」后按界面当前时间倒计时，保存后清除 */
const fixedTimeCountdownOverride = new Map<string, string>()
/** 固定时间重置时的周期起点时间戳（key -> 重置那一刻的 Date.now()），返回给前端用于起始时间与进度，不随每次 getReminderCountdowns 的 now 变化 */
const fixedTimeCycleStartAt = new Map<string, number>()

/**
 * fixed 单次触发（weekdaysEnabled 全 false）状态
 * 语义：允许触发“下一次”一次后自动停止，不再进入下一周期。
 */
const fixedSingleShotState = new Map<
  string,
  { signature: string; fired: boolean; stoppedAtMs: number | null }
>()
/** fixed 拆分休息弹窗去重：同一周期同一休息段仅触发一次 */
const fixedRestBreakState = new Map<
  string,
  { signature: string; firedBreakIndexes: Set<number>; countdownFiredIndexes: Set<number> }
>()
/** fixed 休息开始弹窗的 setTimeout 句柄 */
const fixedRestBreakTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
/** fixed 休息结束倒计时的 setTimeout 句柄 */
const fixedRestEndCountdownTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

function showReminder(title: string, body: string) {
  const now = new Date()
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  reminderLog('弹窗', { title, bodyPreview: (body || '').slice(0, 40), timeStr })
  showReminderPopup({ title, body, timeStr })
}

function parseTimeHHmm(hhmm: string): { h: number; m: number } {
  const [h, m] = hhmm.split(':').map(Number)
  return { h: h ?? 0, m: m ?? 0 }
}

function isSameMinute(now: Date, h: number, m: number): boolean {
  return now.getHours() === h && now.getMinutes() === m
}

/** weekdaysEnabled 与 Date.getDay() 对齐；缺省或非 7 项 = 每天；全 false 不响铃 */
function shouldFireFixedOnWeekday(weekdaysEnabled: boolean[] | undefined, day: number): boolean {
  if (!weekdaysEnabled || weekdaysEnabled.length !== 7) return true
  if (!weekdaysEnabled.some(Boolean)) return false
  return Boolean(weekdaysEnabled[day])
}

/** 下次在 HH:mm 且（若配置了星期）落在允许星期上的时刻 */
function getNextFixedOccurrenceMs(timeStr: string, weekdaysEnabled: boolean[] | undefined, nowMs: number): number {
  const { h, m } = parseTimeHHmm(timeStr)
  const now = new Date(nowMs)
  const hasMask = Array.isArray(weekdaysEnabled) && weekdaysEnabled.length === 7
  const anyOn = hasMask && weekdaysEnabled.some(Boolean)
  // weekdays 全关由调用方按「单次触发」语义处理；这里作为兜底返回下一次 HH:mm。
  if (hasMask && !anyOn) return getNextFixedTime(timeStr)

  for (let dayOffset = 0; dayOffset < 370; dayOffset++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, h, m, 0, 0)
    if (d.getTime() <= nowMs) continue
    if (!hasMask) return d.getTime()
    if (weekdaysEnabled![d.getDay()]) return d.getTime()
  }
  return getNextFixedTime(timeStr)
}

/** 到整分时检查所有固定时间子提醒（须与 getReminderCountdowns 一致：优先 fixedTimeCountdownOverride） */
function runFixedTimeCheck() {
  const s = getSettings()
  const now = new Date()
  const nowMs = now.getTime()
  const DAY_MS = 24 * 3600 * 1000
  for (const cat of s.reminderCategories) {
    for (const item of cat.items) {
      if (item.mode !== 'fixed') continue
      if (item.enabled === false) continue
      const key = `${cat.id}_${item.id}`
      const timeStr = fixedTimeCountdownOverride.get(key) ?? item.time
      const wd = item.weekdaysEnabled
      const hasMask = Array.isArray(wd) && wd.length === 7
      const anyOn = hasMask ? wd!.some(Boolean) : false
      const maskKey = hasMask ? wd!.map((x) => (x ? '1' : '0')).join('') : 'no-mask'
      const singleShotSignature = `single|${timeStr}|${maskKey}`
      const { h, m } = parseTimeHHmm(timeStr)

      // fixed 拆分休息段弹窗：到达每段工作结束点时触发一次休息提示
      const splitCount = Math.max(1, Math.min(10, item.splitCount ?? 1))
      const restDurationMs = Math.max(0, item.restDurationSeconds ?? 0) * 1000
      if (splitCount > 1 && restDurationMs > 0) {
        const overrideStartAt = fixedTimeCycleStartAt.get(key)
        const nextAtForCycle = hasMask && !anyOn
          ? getNextFixedTime(timeStr)
          : getNextFixedOccurrenceMs(timeStr, item.weekdaysEnabled, nowMs)
        const cycleStartAt = overrideStartAt ?? (nextAtForCycle - DAY_MS)
        const cycleSpanMs = Math.max(1, nextAtForCycle - cycleStartAt)
        const plan = buildSplitSchedule(cycleSpanMs, splitCount, restDurationMs)
        if (plan.workDurationsMs.length <= 1) continue
        const cycleSignature = `fixed-rest|${timeStr}|${splitCount}|${restDurationMs}|${cycleStartAt}`
        const prev = fixedRestBreakState.get(key)
        if (!prev || prev.signature !== cycleSignature) {
          clearFixedRestTimersByKey(key)
          fixedRestBreakState.set(key, { signature: cycleSignature, firedBreakIndexes: new Set<number>(), countdownFiredIndexes: new Set<number>() })
        }
        const cur = fixedRestBreakState.get(key)!
        const restSec = Math.round(restDurationMs / 1000)
        const countdownSec = Math.min(5, restSec)
        let workAccMs = 0
        for (let i = 0; i < plan.workDurationsMs.length - 1; i++) {
          workAccMs += plan.workDurationsMs[i]
          const restStartMs = workAccMs + i * restDurationMs
          const restStartAt = cycleStartAt + restStartMs
          const restEndAt = restStartAt + restDurationMs
          const timeoutKey = `${key}_${i}`

          const fireRestBreak = () => {
            const latest = fixedRestBreakState.get(key)
            if (!latest || latest.signature !== cycleSignature || latest.firedBreakIndexes.has(i)) return
            reminderLog('固定时间·休息段弹窗', { key, phaseIndex: i })
            showReminder(cat.name, item.restContent ?? '休息一下')
            latest.firedBreakIndexes.add(i)
          }
          if (!cur.firedBreakIndexes.has(i)) {
            if (nowMs >= restStartAt && nowMs < restEndAt) {
              fireRestBreak()
              const t = fixedRestBreakTimeouts.get(timeoutKey)
              if (t) {
                clearTimeout(t)
                fixedRestBreakTimeouts.delete(timeoutKey)
              }
            } else if (nowMs < restStartAt) {
              if (!fixedRestBreakTimeouts.has(timeoutKey)) {
                const t = setTimeout(() => {
                  fireRestBreak()
                  fixedRestBreakTimeouts.delete(timeoutKey)
                }, restStartAt - nowMs)
                fixedRestBreakTimeouts.set(timeoutKey, t)
              }
            } else {
              cur.firedBreakIndexes.add(i)
            }
          }

          if (countdownSec >= 1 && !cur.countdownFiredIndexes.has(i)) {
            const countdownAt = restEndAt - countdownSec * 1000
            const fireRestCountdown = () => {
              const latest = fixedRestBreakState.get(key)
              if (!latest || latest.signature !== cycleSignature || latest.countdownFiredIndexes.has(i)) return
              reminderLog('固定时间·休息结束倒计时', { key, phaseIndex: i, countdownSec })
              showRestEndCountdownPopup(countdownSec, cat.name)
              latest.countdownFiredIndexes.add(i)
            }
            if (nowMs >= countdownAt && nowMs < restEndAt) {
              fireRestCountdown()
              const t = fixedRestEndCountdownTimeouts.get(timeoutKey)
              if (t) {
                clearTimeout(t)
                fixedRestEndCountdownTimeouts.delete(timeoutKey)
              }
            } else if (nowMs < countdownAt) {
              if (!fixedRestEndCountdownTimeouts.has(timeoutKey)) {
                const t = setTimeout(() => {
                  fireRestCountdown()
                  fixedRestEndCountdownTimeouts.delete(timeoutKey)
                }, countdownAt - nowMs)
                fixedRestEndCountdownTimeouts.set(timeoutKey, t)
              }
            } else {
              cur.countdownFiredIndexes.add(i)
            }
          }
        }
      } else {
        fixedRestBreakState.delete(key)
        clearFixedRestTimersByKey(key)
      }

      if (!isSameMinute(now, h, m)) continue
      if (hasMask && !anyOn) {
        // 单次触发：触发一次后停止
        const st = fixedSingleShotState.get(key)
        if (!st || st.signature !== singleShotSignature) {
          fixedSingleShotState.set(key, { signature: singleShotSignature, fired: false, stoppedAtMs: null })
        }
        const cur = fixedSingleShotState.get(key)!
        if (cur.fired) continue
        reminderLog('固定时间（单次）整分触发', { key, timeStr, cat: cat.name })
        showReminder(cat.name, item.content || '提醒')
        fixedSingleShotState.set(key, { ...cur, fired: true, stoppedAtMs: now.getTime() })
        continue
      }

      if (!shouldFireFixedOnWeekday(item.weekdaysEnabled, now.getDay())) continue
      reminderLog('固定时间整分触发', { key, timeStr, cat: cat.name })
      showReminder(cat.name, item.content || '提醒')
    }
  }
}

/** 单条整分对齐的 timeout 链，覆盖所有 fixed 项 */
function scheduleFixedTimeReminders() {
  if (fixedMinuteTimeout) {
    clearTimeout(fixedMinuteTimeout)
    fixedMinuteTimeout = null
  }
  function runAtNextMinute() {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0)
    const ms = next.getTime() - now.getTime()
    fixedMinuteTimeout = setTimeout(() => {
      runFixedTimeCheck()
      runAtNextMinute()
    }, Math.max(0, ms))
  }
  runFixedTimeCheck()
  runAtNextMinute()
}

function clearRestEndCountdown(key: string) {
  const t = restEndCountdownTimeouts.get(key)
  if (t) clearTimeout(t)
  restEndCountdownTimeouts.delete(key)
}

function getWorkDurationMs(st: IntervalState, phaseIndex: number): number {
  if (phaseIndex < 0) return 0
  return st.workDurationsMs[phaseIndex] ?? st.segmentDurationMs
}

/**
 * 休息结束前弹出倒计时弹窗。
 * countdownSec = min(5, restDurationSec)，在休息段最后 countdownSec 秒时触发。
 */
function scheduleRestEndCountdown(key: string, restDurationMs: number, categoryName: string) {
  clearRestEndCountdown(key)
  const restSec = Math.round(restDurationMs / 1000)
  if (restSec < 1) return
  const countdownSec = Math.min(5, restSec)
  const delayMs = restDurationMs - countdownSec * 1000
  const fireCountdown = () => {
    reminderLog('休息结束倒计时弹窗', { key, countdownSec })
    showRestEndCountdownPopup(countdownSec, categoryName)
    restEndCountdownTimeouts.delete(key)
  }
  if (delayMs <= 0) {
    fireCountdown()
    return
  }
  const t = setTimeout(fireCountdown, delayMs)
  restEndCountdownTimeouts.set(key, t)
}

function scheduleNextPhase(key: string) {
  const st = intervalState.get(key)
  if (!st) return
  const now = Date.now()

  if (st.phase === 'work') {
    if (st.phaseIndex < st.splitCount - 1) {
      // 本段工作结束，进入休息（若休息>0）
      if (st.restDurationMs > 0) {
        reminderLog('间隔·休息段弹窗', { key, phaseIndex: st.phaseIndex })
        showReminder(st.categoryName, st.restContent || '休息一下')
        st.phase = 'rest'
        st.phaseStartTime = now
        const t = setTimeout(() => scheduleNextPhase(key), st.restDurationMs)
        intervalTimeouts.set(key, t)
        scheduleRestEndCountdown(key, st.restDurationMs, st.categoryName)
      } else {
        st.phaseIndex++
        st.phaseStartTime = now
        const nextWorkMs = getWorkDurationMs(st, st.phaseIndex)
        const t = setTimeout(() => scheduleNextPhase(key), nextWorkMs)
        intervalTimeouts.set(key, t)
      }
      return
    }
    // 最后一段工作结束 → 主提醒，新一轮
    reminderLog('间隔·主提醒', {
      key,
      firedCount: st.firedCount + 1,
      nextSegmentMs: st.segmentDurationMs,
      intervalMs: st.intervalMs,
    })
    showReminder(st.categoryName, st.content)
    st.firedCount++
    st.startTime = now
    st.phaseIndex = 0
    st.phase = 'work'
    st.phaseStartTime = now
    if (st.repeatCount !== null && st.firedCount >= st.repeatCount) {
      intervalCompletedState.set(key, {
        completedAt: now,
        repeatCount: st.repeatCount,
        firedCount: st.firedCount,
        splitCount: st.splitCount,
        segmentDurationMs: st.segmentDurationMs,
        workDurationsMs: st.workDurationsMs.slice(),
        restDurationMs: st.restDurationMs,
        cycleTotalMs: st.cycleTotalMs,
      })
      const t = intervalTimeouts.get(key)
      if (t) clearTimeout(t)
      intervalTimeouts.delete(key)
      intervalState.delete(key)
      const i = intervalTimerKeys.indexOf(key)
      if (i >= 0) intervalTimerKeys.splice(i, 1)
      return
    }
    const firstWorkMs = getWorkDurationMs(st, 0)
    const t = setTimeout(() => scheduleNextPhase(key), firstWorkMs)
    intervalTimeouts.set(key, t)
    return
  }

  // phase === 'rest' 结束，进入下一段工作
  clearRestEndCountdown(key)
  st.phase = 'work'
  st.phaseIndex++
  st.phaseStartTime = now
  const workMs = getWorkDurationMs(st, st.phaseIndex)
  const t = setTimeout(() => scheduleNextPhase(key), workMs)
  intervalTimeouts.set(key, t)
}

/** 从旧 state 计算本周期内已过时间（毫秒） */
function getElapsedInCycle(st: IntervalState, now: number): number {
  const elapsedBeforePhase = (() => {
    let acc = 0
    for (let i = 0; i < st.phaseIndex; i++) {
      acc += getWorkDurationMs(st, i)
      if (st.restDurationMs > 0) acc += st.restDurationMs
    }
    return acc
  })()
  if (st.phase === 'work') {
    return elapsedBeforePhase + (now - st.phaseStartTime)
  }
  return elapsedBeforePhase + getWorkDurationMs(st, st.phaseIndex) + (now - st.phaseStartTime)
}

/** 根据已过时间推算应处的 phase、phaseIndex、phaseStartTime，并返回当前阶段剩余 ms */
function placeElapsedInNewCycle(
  elapsedMs: number,
  workDurationsMs: number[],
  restDurationMs: number,
  now: number
): { phase: 'work' | 'rest'; phaseIndex: number; phaseStartTime: number; remainingInPhaseMs: number } {
  let acc = 0
  for (let i = 0; i < workDurationsMs.length; i++) {
    const workMs = workDurationsMs[i]
    if (elapsedMs < acc + workMs) {
      const elapsedInPhase = elapsedMs - acc
      return {
        phase: 'work',
        phaseIndex: i,
        phaseStartTime: now - elapsedInPhase,
        remainingInPhaseMs: workMs - elapsedInPhase,
      }
    }
    acc += workMs
    if (restDurationMs > 0) {
      if (elapsedMs < acc + restDurationMs) {
        const elapsedInPhase = elapsedMs - acc
        return {
          phase: 'rest',
          phaseIndex: i,
          phaseStartTime: now - elapsedInPhase,
          remainingInPhaseMs: restDurationMs - elapsedInPhase,
        }
      }
      acc += restDurationMs
    }
  }
  return {
    phase: 'work',
    phaseIndex: 0,
    phaseStartTime: now,
    remainingInPhaseMs: workDurationsMs[0] ?? 0,
  }
}

function scheduleIntervalReminders() {
  const now = Date.now()
  const prevState = new Map(intervalState)
  for (const key of intervalTimerKeys) {
    const t = intervalTimeouts.get(key)
    if (t) clearTimeout(t)
    intervalTimeouts.delete(key)
    intervalState.delete(key)
  }
  intervalTimerKeys.length = 0

  const s = getSettings()
  for (const cat of s.reminderCategories) {
    for (const item of cat.items) {
      if (item.mode !== 'interval') continue
      if (item.enabled === false) {
        intervalCompletedState.delete(`${cat.id}_${item.id}`)
        continue
      }
      const h = item.intervalHours ?? 0
      const m = item.intervalMinutes ?? 0
      const sec = item.intervalSeconds ?? 0
      const totalSec = Math.max(1, h * 3600 + m * 60 + sec)
      const intervalMs = totalSec * 1000
      const repeatCount = item.repeatCount ?? null
      const splitCount = Math.max(1, Math.min(10, item.splitCount ?? 1))
      const restSec = Math.max(0, item.restDurationSeconds ?? 0)
      const restDurationMs = restSec * 1000
      const plan = buildSplitSchedule(intervalMs, splitCount, restDurationMs)
      const effectiveSplitCount = plan.workDurationsMs.length
      const effectiveRestMs = effectiveSplitCount > 1 ? restDurationMs : 0
      const segmentDurationMs = plan.workDurationsMs[0] ?? intervalMs
      const key = `${cat.id}_${item.id}`
      intervalCompletedState.delete(key)
      const oldSt = prevState.get(key)
      const newCycleTotalMs = plan.cycleTotalMs
      let phase: 'work' | 'rest' = 'work'
      let phaseIndex = 0
      let phaseStartTime = now
      let timeoutMs = segmentDurationMs
      if (oldSt && oldSt.intervalMs === intervalMs) {
        const oldElapsed = getElapsedInCycle(oldSt, now)
        const newElapsed = Math.min(oldElapsed, newCycleTotalMs)
        const placed = placeElapsedInNewCycle(newElapsed, plan.workDurationsMs, effectiveRestMs, now)
        phase = placed.phase
        phaseIndex = placed.phaseIndex
        phaseStartTime = placed.phaseStartTime
        timeoutMs = Math.max(0, Math.floor(placed.remainingInPhaseMs))
      }
      const state: IntervalState = {
        startTime: now,
        firedCount: oldSt?.firedCount ?? 0,
        intervalMs,
        repeatCount,
        categoryName: cat.name,
        content: item.content || '提醒',
        splitCount: effectiveSplitCount,
        segmentDurationMs,
        workDurationsMs: plan.workDurationsMs.slice(),
        restDurationMs: effectiveRestMs,
        cycleTotalMs: plan.cycleTotalMs,
        restContent: item.restContent ?? '休息一下',
        phase,
        phaseIndex,
        phaseStartTime,
      }
      intervalState.set(key, state)
      const timer = setTimeout(() => scheduleNextPhase(key), timeoutMs)
      intervalTimeouts.set(key, timer)
      intervalTimerKeys.push(key)
    }
  }
}

export function startReminders() {
  scheduleFixedTimeReminders()
  scheduleIntervalReminders()
  // 立即执行一次：用于补齐 fixed 拆分休息段的秒级预调度，避免首次整分前漏掉休息弹窗。
  runFixedTimeCheck()
}

export function stopReminders() {
  if (fixedMinuteTimeout) {
    clearTimeout(fixedMinuteTimeout)
    fixedMinuteTimeout = null
  }
  for (const key of intervalTimerKeys) {
    const t = intervalTimeouts.get(key)
    if (t) clearTimeout(t)
  }
  intervalTimeouts.clear()
  for (const t of restEndCountdownTimeouts.values()) clearTimeout(t)
  restEndCountdownTimeouts.clear()
  for (const t of fixedRestBreakTimeouts.values()) clearTimeout(t)
  fixedRestBreakTimeouts.clear()
  for (const t of fixedRestEndCountdownTimeouts.values()) clearTimeout(t)
  fixedRestEndCountdownTimeouts.clear()
  intervalState.clear()
  intervalCompletedState.clear()
  intervalTimerKeys.length = 0
}

export function restartReminders() {
  stopReminders()
  startReminders()
}

function removeIntervalTimerByKey(key: string): void {
  const t = intervalTimeouts.get(key)
  if (t) clearTimeout(t)
  intervalTimeouts.delete(key)
  clearRestEndCountdown(key)
  intervalState.delete(key)
  intervalCompletedState.delete(key)
  const i = intervalTimerKeys.indexOf(key)
  if (i >= 0) intervalTimerKeys.splice(i, 1)
}

function buildIntervalPayload(cat: ReminderCategory, item: SubReminder & { mode: 'interval' }): ResetIntervalPayload {
  return {
    categoryName: cat.name,
    content: item.content || '提醒',
    intervalHours: item.intervalHours,
    intervalMinutes: item.intervalMinutes,
    intervalSeconds: item.intervalSeconds,
    repeatCount: item.repeatCount ?? null,
    splitCount: item.splitCount,
    restDurationSeconds: item.restDurationSeconds,
    restContent: item.restContent,
  }
}

/** 与「仅改文案」区分：这些变了必须按新配置重排 setTimeout */
function intervalTimingSignature(item: SubReminder & { mode: 'interval' }): string {
  const h = item.intervalHours ?? 0
  const m = item.intervalMinutes ?? 0
  const s = item.intervalSeconds ?? 0
  const split = Math.max(1, Math.min(10, item.splitCount ?? 1))
  const rest = Math.max(0, item.restDurationSeconds ?? 0)
  return `${h}|${m}|${s}|${split}|${rest}`
}

/**
 * setSettings 写入磁盘后调用：让内存中的倒计时候选与配置一致。
 * 自动保存不会调 restartReminders；若用户已把间隔从 1 分钟改成 15 分钟，此处会 reset 该条，避免仍按旧间隔每分钟弹窗。
 */
export function syncIntervalTimersAfterSettingsChange(
  prevCategories: ReminderCategory[],
  nextCategories: ReminderCategory[],
): void {
  const prevMap = new Map<string, { cat: ReminderCategory; item: SubReminder & { mode: 'interval' } }>()
  for (const cat of prevCategories) {
    for (const item of cat.items) {
      if (item.mode !== 'interval') continue
      prevMap.set(`${cat.id}_${item.id}`, { cat, item: item as SubReminder & { mode: 'interval' } })
    }
  }
  const nextKeys = new Set<string>()
  for (const cat of nextCategories) {
    for (const item of cat.items) {
      if (item.mode !== 'interval') continue
      const iv = item as SubReminder & { mode: 'interval' }
      const key = `${cat.id}_${item.id}`
      nextKeys.add(key)
      const prevEntry = prevMap.get(key)
      if (!prevEntry) {
        reminderLog('syncInterval: 新子项', { key })
        if (iv.enabled === false) {
          removeIntervalTimerByKey(key)
          continue
        }
        resetReminderProgress(key, buildIntervalPayload(cat, iv))
        continue
      }
      const prevEnabled = prevEntry.item.enabled !== false
      const nextEnabled = iv.enabled !== false
      if (!nextEnabled) {
        removeIntervalTimerByKey(key)
        continue
      }
      if (!prevEnabled && nextEnabled) {
        resetReminderProgress(key, buildIntervalPayload(cat, iv))
        continue
      }
      if (intervalTimingSignature(prevEntry.item) !== intervalTimingSignature(iv)) {
        reminderLog('syncInterval: 时长/拆分变更，重排', {
          key,
          prev: intervalTimingSignature(prevEntry.item),
          next: intervalTimingSignature(iv),
        })
        resetReminderProgress(key, buildIntervalPayload(cat, iv))
        continue
      }
      const st = intervalState.get(key)
      if (st) {
        st.content = iv.content || '提醒'
        st.categoryName = cat.name
        st.repeatCount = iv.repeatCount ?? null
        st.restContent = iv.restContent ?? '休息一下'
      }
    }
  }
  for (const key of [...intervalTimerKeys]) {
    if (nextKeys.has(key)) continue
    reminderLog('syncInterval: 删除子项，清定时器', { key })
    removeIntervalTimerByKey(key)
  }
}

/** 重置指定间隔提醒的进度（仅此一条）。若传入 payload 则用当前界面配置，否则从磁盘 getSettings 读取 */
export function resetReminderProgress(key: string, payload?: ResetIntervalPayload): void {
  removeIntervalTimerByKey(key)

  let h: number, m: number, sec: number, repeatCount: number | null, categoryName: string, content: string, splitCount: number, restSec: number, restContent: string
  if (payload) {
    h = payload.intervalHours ?? 0
    m = payload.intervalMinutes ?? 0
    sec = payload.intervalSeconds ?? 0
    repeatCount = payload.repeatCount ?? null
    categoryName = payload.categoryName
    content = payload.content || '提醒'
    splitCount = Math.max(1, Math.min(10, payload.splitCount ?? 1))
    restSec = Math.max(0, payload.restDurationSeconds ?? 0)
    restContent = payload.restContent ?? '休息一下'
  } else {
    const s = getSettings()
    let cat: (typeof s.reminderCategories)[0] | undefined
    let item: (typeof s.reminderCategories)[0]['items'][0] | undefined
    for (const c of s.reminderCategories) {
      for (const it of c.items) {
        if (`${c.id}_${it.id}` === key) {
          cat = c
          item = it
          break
        }
      }
      if (item) break
    }
    if (!cat || !item || item.mode !== 'interval') return
    const itemInterval = item.mode === 'interval' ? item : null
    if (!itemInterval) return
    h = itemInterval.intervalHours ?? 0
    m = itemInterval.intervalMinutes ?? 0
    sec = itemInterval.intervalSeconds ?? 0
    repeatCount = itemInterval.repeatCount ?? null
    categoryName = cat.name
    content = itemInterval.content || '提醒'
    splitCount = Math.max(1, Math.min(10, itemInterval.splitCount ?? 1))
    restSec = Math.max(0, itemInterval.restDurationSeconds ?? 0)
    restContent = itemInterval.restContent ?? '休息一下'
  }

  const totalSec = Math.max(1, h * 3600 + m * 60 + sec)
  const intervalMs = totalSec * 1000
  const restDurationMs = restSec * 1000
  const plan = buildSplitSchedule(intervalMs, splitCount, restDurationMs)
  const effectiveSplitCount = plan.workDurationsMs.length
  const effectiveRestMs = effectiveSplitCount > 1 ? restDurationMs : 0
  const segmentDurationMs = plan.workDurationsMs[0] ?? intervalMs
  const now = Date.now()
  const newSt: IntervalState = {
    startTime: now,
    firedCount: 0,
    intervalMs,
    repeatCount,
    categoryName,
    content,
    splitCount: effectiveSplitCount,
    segmentDurationMs,
    workDurationsMs: plan.workDurationsMs.slice(),
    restDurationMs: effectiveRestMs,
    cycleTotalMs: plan.cycleTotalMs,
    restContent,
    phase: 'work',
    phaseIndex: 0,
    phaseStartTime: now,
  }
  intervalState.set(key, newSt)
  const timer = setTimeout(() => scheduleNextPhase(key), segmentDurationMs)
  intervalTimeouts.set(key, timer)
  intervalTimerKeys.push(key)
}

/** 固定时间：计算下次触发的时刻（今天或明天 HH:mm） */
function getNextFixedTime(timeStr: string): number {
  const { h, m } = parseTimeHHmm(timeStr)
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next.getTime()
}

import type { CountdownItem } from '../shared/settings'

export type { CountdownItem }

function clearFixedRestEndCountdownTimeoutsByKey(key: string): void {
  const prefix = `${key}_`
  for (const [timeoutKey, timer] of fixedRestEndCountdownTimeouts.entries()) {
    if (!timeoutKey.startsWith(prefix)) continue
    clearTimeout(timer)
    fixedRestEndCountdownTimeouts.delete(timeoutKey)
  }
}

function clearFixedRestBreakTimeoutsByKey(key: string): void {
  const prefix = `${key}_`
  for (const [timeoutKey, timer] of fixedRestBreakTimeouts.entries()) {
    if (!timeoutKey.startsWith(prefix)) continue
    clearTimeout(timer)
    fixedRestBreakTimeouts.delete(timeoutKey)
  }
}

function clearFixedRestTimersByKey(key: string): void {
  clearFixedRestBreakTimeoutsByKey(key)
  clearFixedRestEndCountdownTimeoutsByKey(key)
}

/** 固定时间「重置」：按界面当前设定时间从当前时刻倒计时；time 为 HH:mm，并记录周期起点供起始时间显示 */
export function setFixedTimeCountdownOverride(key: string, time: string): void {
  const now = Date.now()
  fixedTimeCountdownOverride.set(key, time)
  fixedTimeCycleStartAt.set(key, now)
  // 关键：单次 fixed（weekdays 全 false）在触发后会被标记 fired=true。
  // 点击“启动/重置”应开启新一轮，必须清理该状态，否则 getReminderCountdowns 会持续返回 ended=true。
  fixedSingleShotState.delete(key)
  // 重启新周期时，清理旧周期的休息段去重与倒计时句柄，避免沿用旧状态导致分段显示/弹窗异常。
  fixedRestBreakState.delete(key)
  clearFixedRestTimersByKey(key)
  // 立即补调度 fixed 拆分休息段弹窗，不等待下一次整分检查。
  runFixedTimeCheck()
}

/** 保存设置后清除固定时间倒计时覆盖（仅在被调用时执行，保存设置不再自动调用） */
export function clearFixedTimeCountdownOverrides(): void {
  fixedTimeCountdownOverride.clear()
  fixedTimeCycleStartAt.clear()
}

/** 全部重置：将所有固定时间的周期起点与所有间隔的进度更新为「从当前时刻开始」，使用当前 getSettings 的配置 */
export function resetAllReminderProgress(): void {
  const s = getSettings()
  for (const cat of s.reminderCategories) {
    for (const item of cat.items) {
      const key = `${cat.id}_${item.id}`
      if (item.mode === 'fixed') {
        setFixedTimeCountdownOverride(key, item.time)
      } else if (item.mode === 'interval') {
        const payload: ResetIntervalPayload = {
          categoryName: cat.name,
          content: item.content || '提醒',
          intervalHours: item.intervalHours,
          intervalMinutes: item.intervalMinutes,
          intervalSeconds: item.intervalSeconds,
          repeatCount: item.repeatCount ?? null,
          splitCount: item.splitCount,
          restDurationSeconds: item.restDurationSeconds,
          restContent: item.restContent,
        }
        resetReminderProgress(key, payload)
      }
    }
  }
}

export function getReminderCountdowns(): CountdownItem[] {
  const result: CountdownItem[] = []
  const now = Date.now()
  const s = getSettings()

  for (const cat of s.reminderCategories) {
    for (const item of cat.items) {
      const key = `${cat.id}_${item.id}`
      if (item.mode === 'fixed') {
        if (item.enabled === false) {
          result.push({ key, type: 'fixed', nextAt: now, remainingMs: 0, ended: true, time: item.time })
          continue
        }
        const timeStr = fixedTimeCountdownOverride.get(key) ?? item.time
        const wd = item.weekdaysEnabled
        const hasMask = Array.isArray(wd) && wd.length === 7
        const anyOn = hasMask ? wd!.some(Boolean) : false
        const maskKey = hasMask ? wd!.map((x) => (x ? '1' : '0')).join('') : 'no-mask'
        const singleShotSignature = `single|${timeStr}|${maskKey}`

        let nextAt: number
        let remainingMs: number
        const singleShot = hasMask && !anyOn
        if (singleShot) {
          const st = fixedSingleShotState.get(key)
          if (st && st.signature === singleShotSignature && st.fired) {
            nextAt = st.stoppedAtMs ?? now
            remainingMs = 0
          } else {
            // 未触发前：始终按“下一次 HH:mm”计算，避免在同一分钟内重启时 remaining 被误判为 0。
            // 例如 18:24:10 点击“启动”，应直接进入到“明天 18:24”的新周期，而不是卡到 18:25:00。
            nextAt = getNextFixedTime(timeStr)
            remainingMs = Math.max(0, nextAt - now)
          }
        } else {
          // 周期触发：始终按下一次合法触发点计算，避免同一分钟内出现“假结束”显示。
          nextAt = getNextFixedOccurrenceMs(timeStr, item.weekdaysEnabled, now)
          remainingMs = Math.max(0, nextAt - now)
        }
        const hasOverride = fixedTimeCountdownOverride.has(key)
        const cycleStartAt = hasOverride ? (fixedTimeCycleStartAt.get(key) ?? now) : undefined
        const base: CountdownItem = {
          key,
          type: 'fixed',
          nextAt,
          remainingMs,
          ended: singleShot && remainingMs <= 0,
          time: timeStr,
          ...(cycleStartAt !== undefined ? { cycleStartAt } : {}),
        }
        result.push(base)
      } else if (item.mode === 'interval') {
        if (item.enabled === false) {
          result.push({
            key,
            type: 'interval',
            nextAt: now,
            remainingMs: 0,
            ended: true,
            workRemainingMs: 0,
            repeatCount: item.repeatCount,
            firedCount: 0,
            splitCount: item.splitCount,
          })
          continue
        }
        const st = intervalState.get(key)
        if (!st) {
          const completed = intervalCompletedState.get(key)
          if (completed) {
            result.push({
              key,
              type: 'interval',
              nextAt: completed.completedAt,
              remainingMs: 0,
              ended: true,
              workRemainingMs: 0,
              repeatCount: completed.repeatCount,
              firedCount: completed.firedCount,
              splitCount: completed.splitCount,
              segmentDurationMs: completed.segmentDurationMs,
              workDurationsMs: completed.workDurationsMs.slice(),
              restDurationMs: completed.restDurationMs,
              currentPhase: 'work',
              phaseIndex: Math.max(0, completed.splitCount - 1),
              phaseElapsedMs: completed.segmentDurationMs,
              phaseTotalMs: completed.segmentDurationMs,
              cycleTotalMs: completed.cycleTotalMs,
            })
          } else {
            result.push({ key, type: 'interval', nextAt: now, remainingMs: 0, repeatCount: item.repeatCount, firedCount: 0 })
          }
          continue
        }
        const phaseElapsedMs = now - st.phaseStartTime
        const phaseTotalMs = st.phase === 'work' ? getWorkDurationMs(st, st.phaseIndex) : st.restDurationMs
        const remainingInPhase = Math.max(0, phaseTotalMs - phaseElapsedMs)
        let remainingMs = remainingInPhase
        if (st.phase === 'work') {
          for (let i = st.phaseIndex + 1; i < st.splitCount; i++) {
            remainingMs += st.restDurationMs + getWorkDurationMs(st, i)
          }
        } else {
          remainingMs += getWorkDurationMs(st, st.phaseIndex + 1)
          for (let i = st.phaseIndex + 2; i < st.splitCount; i++) {
            remainingMs += st.restDurationMs + getWorkDurationMs(st, i)
          }
        }
        const cycleTotalMs = st.cycleTotalMs
        const nextAt = now + remainingMs
        // 仅工作段剩余（不含休息），与用户设置的「倒计时」一致，用于界面大数字显示
        let workRemainingMs: number
        if (st.phase === 'work') {
          workRemainingMs = remainingInPhase
          for (let i = st.phaseIndex + 1; i < st.splitCount; i++) {
            workRemainingMs += getWorkDurationMs(st, i)
          }
        } else {
          workRemainingMs = 0
          for (let i = st.phaseIndex + 1; i < st.splitCount; i++) {
            workRemainingMs += getWorkDurationMs(st, i)
          }
        }
        result.push({
          key,
          type: 'interval',
          nextAt,
          remainingMs,
          workRemainingMs,
          repeatCount: st.repeatCount,
          firedCount: st.firedCount,
          splitCount: st.splitCount,
          segmentDurationMs: st.segmentDurationMs,
          workDurationsMs: st.workDurationsMs.slice(),
          restDurationMs: st.restDurationMs,
          currentPhase: st.phase,
          phaseIndex: st.phaseIndex,
          phaseElapsedMs,
          phaseTotalMs,
          cycleTotalMs,
        })
      }
      /* mode === 'stopwatch'：无倒计时、无弹窗 */
    }
  }
  return result
}
