import { getSettings } from './settings'
import type { ReminderCategory, SubReminder } from './settings'
import type { ResetIntervalPayload } from '../shared/settings'
import { showReminderPopup } from './reminderWindow'

const REMINDER_LOG = true
function reminderLog(...args: unknown[]) {
  if (REMINDER_LOG) console.log('[WorkBreak][Reminder]', ...args)
}

let fixedMinuteTimeout: ReturnType<typeof setTimeout> | null = null
const intervalTimerKeys: string[] = []
const intervalTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
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
  /** 中间休息时长（毫秒），0 表示无 */
  restDurationMs: number
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

/** 固定时间倒计时覆盖：key -> HH:mm，用于「重置」后按界面当前时间倒计时，保存后清除 */
const fixedTimeCountdownOverride = new Map<string, string>()
/** 固定时间重置时的周期起点时间戳（key -> 重置那一刻的 Date.now()），返回给前端用于起始时间与进度，不随每次 getReminderCountdowns 的 now 变化 */
const fixedTimeCycleStartAt = new Map<string, number>()

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

/** 到整分时检查所有固定时间子提醒（须与 getReminderCountdowns 一致：优先 fixedTimeCountdownOverride） */
function runFixedTimeCheck() {
  const s = getSettings()
  const now = new Date()
  for (const cat of s.reminderCategories) {
    for (const item of cat.items) {
      if (item.mode !== 'fixed') continue
      const key = `${cat.id}_${item.id}`
      const timeStr = fixedTimeCountdownOverride.get(key) ?? item.time
      const { h, m } = parseTimeHHmm(timeStr)
      if (isSameMinute(now, h, m)) {
        reminderLog('固定时间整分触发', { key, timeStr, cat: cat.name })
        showReminder(cat.name, item.content || '提醒')
      }
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
      } else {
        st.phaseIndex++
        st.phaseStartTime = now
        const t = setTimeout(() => scheduleNextPhase(key), st.segmentDurationMs)
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
      const t = intervalTimeouts.get(key)
      if (t) clearTimeout(t)
      intervalTimeouts.delete(key)
      intervalState.delete(key)
      const i = intervalTimerKeys.indexOf(key)
      if (i >= 0) intervalTimerKeys.splice(i, 1)
      return
    }
    const t = setTimeout(() => scheduleNextPhase(key), st.segmentDurationMs)
    intervalTimeouts.set(key, t)
    return
  }

  // phase === 'rest' 结束，进入下一段工作
  st.phase = 'work'
  st.phaseIndex++
  st.phaseStartTime = now
  const t = setTimeout(() => scheduleNextPhase(key), st.segmentDurationMs)
  intervalTimeouts.set(key, t)
}

/** 从旧 state 计算本周期内已过时间（毫秒） */
function getElapsedInCycle(st: IntervalState, now: number): number {
  if (st.phase === 'work') {
    return st.phaseIndex * (st.segmentDurationMs + st.restDurationMs) + (now - st.phaseStartTime)
  }
  return (st.phaseIndex + 1) * st.segmentDurationMs + st.phaseIndex * st.restDurationMs + (now - st.phaseStartTime)
}

/** 根据已过时间推算应处的 phase、phaseIndex、phaseStartTime，并返回当前阶段剩余 ms */
function placeElapsedInNewCycle(
  elapsedMs: number,
  segmentDurationMs: number,
  restDurationMs: number,
  splitCount: number,
  now: number
): { phase: 'work' | 'rest'; phaseIndex: number; phaseStartTime: number; remainingInPhaseMs: number } {
  let acc = 0
  for (let i = 0; i < splitCount; i++) {
    if (elapsedMs < acc + segmentDurationMs) {
      const elapsedInPhase = elapsedMs - acc
      return {
        phase: 'work',
        phaseIndex: i,
        phaseStartTime: now - elapsedInPhase,
        remainingInPhaseMs: segmentDurationMs - elapsedInPhase,
      }
    }
    acc += segmentDurationMs
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
    remainingInPhaseMs: segmentDurationMs,
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
      const h = item.intervalHours ?? 0
      const m = item.intervalMinutes ?? 0
      const sec = item.intervalSeconds ?? 0
      const totalSec = Math.max(1, h * 3600 + m * 60 + sec)
      const intervalMs = totalSec * 1000
      const repeatCount = item.repeatCount ?? null
      const splitCount = Math.max(1, Math.min(10, item.splitCount ?? 1))
      const restSec = Math.max(0, item.restDurationSeconds ?? 0)
      const restDurationMs = restSec * 1000
      const segmentDurationMs = Math.floor(intervalMs / splitCount)
      const key = `${cat.id}_${item.id}`
      const oldSt = prevState.get(key)
      const newCycleTotalMs = segmentDurationMs * splitCount + restDurationMs * (splitCount - 1)
      let phase: 'work' | 'rest' = 'work'
      let phaseIndex = 0
      let phaseStartTime = now
      let timeoutMs = segmentDurationMs
      if (oldSt && oldSt.intervalMs === intervalMs) {
        const oldElapsed = getElapsedInCycle(oldSt, now)
        const newElapsed = Math.min(oldElapsed, newCycleTotalMs)
        const placed = placeElapsedInNewCycle(newElapsed, segmentDurationMs, restDurationMs, splitCount, now)
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
        splitCount,
        segmentDurationMs,
        restDurationMs,
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
  intervalState.clear()
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
  intervalState.delete(key)
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
  const segmentDurationMs = Math.floor(intervalMs / splitCount)
  const now = Date.now()
  const newSt: IntervalState = {
    startTime: now,
    firedCount: 0,
    intervalMs,
    repeatCount,
    categoryName,
    content,
    splitCount,
    segmentDurationMs,
    restDurationMs,
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

/** 固定时间「重置」：按界面当前设定时间从当前时刻倒计时；time 为 HH:mm，并记录周期起点供起始时间显示 */
export function setFixedTimeCountdownOverride(key: string, time: string): void {
  const now = Date.now()
  fixedTimeCountdownOverride.set(key, time)
  fixedTimeCycleStartAt.set(key, now)
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
        const timeStr = fixedTimeCountdownOverride.get(key) ?? item.time
        const nextAt = getNextFixedTime(timeStr)
        const remainingMs = Math.max(0, nextAt - now)
        const hasOverride = fixedTimeCountdownOverride.has(key)
        const cycleStartAt = hasOverride ? (fixedTimeCycleStartAt.get(key) ?? now) : undefined
        const base: CountdownItem = {
          key,
          type: 'fixed',
          nextAt,
          remainingMs,
          time: timeStr,
          ...(cycleStartAt !== undefined ? { cycleStartAt } : {}),
        }
        result.push(base)
      } else if (item.mode === 'interval') {
        const st = intervalState.get(key)
        if (!st) {
          result.push({ key, type: 'interval', nextAt: now, remainingMs: 0, repeatCount: item.repeatCount, firedCount: 0 })
          continue
        }
        const phaseElapsedMs = now - st.phaseStartTime
        const phaseTotalMs = st.phase === 'work' ? st.segmentDurationMs : st.restDurationMs
        const remainingInPhase = Math.max(0, phaseTotalMs - phaseElapsedMs)
        let remainingMs = remainingInPhase
        if (st.phase === 'work') {
          for (let i = st.phaseIndex + 1; i < st.splitCount; i++) {
            remainingMs += st.restDurationMs + st.segmentDurationMs
          }
        } else {
          remainingMs += st.segmentDurationMs
          for (let i = st.phaseIndex + 2; i < st.splitCount; i++) {
            remainingMs += st.restDurationMs + st.segmentDurationMs
          }
        }
        const cycleTotalMs = st.segmentDurationMs * st.splitCount + st.restDurationMs * (st.splitCount - 1)
        const nextAt = now + remainingMs
        // 仅工作段剩余（不含休息），与用户设置的「倒计时」一致，用于界面大数字显示
        let workRemainingMs: number
        if (st.phase === 'work') {
          workRemainingMs = remainingInPhase + (st.splitCount - st.phaseIndex - 1) * st.segmentDurationMs
        } else {
          workRemainingMs = (st.splitCount - st.phaseIndex - 1) * st.segmentDurationMs
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
