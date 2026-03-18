import { Notification } from 'electron'
import { getSettings } from './settings'

let activityTimer: ReturnType<typeof setInterval> | null = null
let restWorkTimer: ReturnType<typeof setTimeout> | null = null
let restBreakTimer: ReturnType<typeof setTimeout> | null = null
let mealCheckInterval: ReturnType<typeof setInterval> | null = null

function showNotification(title: string, body: string) {
  if (!Notification.isSupported()) return
  new Notification({ title, body }).show()
}

function parseTimeHHmm(hhmm: string): { h: number; m: number } {
  const [h, m] = hhmm.split(':').map(Number)
  return { h: h ?? 0, m: m ?? 0 }
}

function isSameMinute(now: Date, h: number, m: number): boolean {
  return now.getHours() === h && now.getMinutes() === m
}

function runMealCheck() {
  const s = getSettings()
  const now = new Date()
  const b = parseTimeHHmm(s.breakfastTime)
  const l = parseTimeHHmm(s.lunchTime)
  const d = parseTimeHHmm(s.dinnerTime)
  if (isSameMinute(now, b.h, b.m)) showNotification('早餐时间', '记得吃早餐哦～')
  if (isSameMinute(now, l.h, l.m)) showNotification('午餐时间', '该吃午饭啦，休息一下～')
  if (isSameMinute(now, d.h, d.m)) showNotification('晚餐时间', '记得吃晚饭～')
}

function scheduleMealReminders() {
  if (mealCheckInterval) clearInterval(mealCheckInterval)
  runMealCheck() // 立即检查一次，避免错过当前这一分钟
  mealCheckInterval = setInterval(runMealCheck, 60 * 1000)
}

function scheduleActivityReminders() {
  if (activityTimer) clearInterval(activityTimer)
  const s = getSettings()
  const min = Math.max(1, s.activityIntervalMinutes)
  activityTimer = setInterval(() => {
    showNotification('起身活动', '坐太久啦，站起来动一动、看看远处吧～')
  }, min * 60 * 1000)
}

function scheduleRestReminders() {
  if (restWorkTimer) clearTimeout(restWorkTimer)
  if (restBreakTimer) clearTimeout(restBreakTimer)

  const s = getSettings()
  const workMin = Math.max(1, s.workMinutes)
  const breakMin = Math.max(1, s.breakMinutes)

  function onWorkEnd() {
    showNotification('休息一下', `已经工作 ${workMin} 分钟，休息 ${breakMin} 分钟吧～`)
    restBreakTimer = setTimeout(() => {
      restBreakTimer = null
      scheduleRestReminders()
    }, breakMin * 60 * 1000)
  }

  restWorkTimer = setTimeout(onWorkEnd, workMin * 60 * 1000)
}

export function startReminders() {
  scheduleMealReminders()
  scheduleActivityReminders()
  scheduleRestReminders()
}

export function stopReminders() {
  if (activityTimer) {
    clearInterval(activityTimer)
    activityTimer = null
  }
  if (restWorkTimer) {
    clearTimeout(restWorkTimer)
    restWorkTimer = null
  }
  if (restBreakTimer) {
    clearTimeout(restBreakTimer)
    restBreakTimer = null
  }
  if (mealCheckInterval) {
    clearInterval(mealCheckInterval)
    mealCheckInterval = null
  }
}

export function restartReminders() {
  stopReminders()
  startReminders()
}
