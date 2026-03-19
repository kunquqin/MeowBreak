import { genId } from '../types'

export type StopwatchLap = {
  id: string
  /** 第几次打点（从 1 递增） */
  lapIndex: number
  /** 与上一打点之间的间隔毫秒 */
  splitMs: number
  /** 从启动到按下打点时的累计毫秒 */
  totalMs: number
}

export type StopwatchRuntime = {
  running: boolean
  /** 已计入的毫秒（不含当前 running 段） */
  accumulatedMs: number
  startedAt: number | null
  /** 最新打点在前（与 iPhone 秒表一致） */
  laps: StopwatchLap[]
}

export function emptyStopwatch(): StopwatchRuntime {
  return { running: false, accumulatedMs: 0, startedAt: null, laps: [] }
}

export function getStopwatchElapsedMs(st: StopwatchRuntime, now = Date.now()): number {
  return st.accumulatedMs + (st.running && st.startedAt != null ? now - st.startedAt : 0)
}

/** 显示：分:秒.百分秒；≥1 小时时 H:MM:SS.cc */
export function formatStopwatchDisplay(ms: number): string {
  const clamped = Math.max(0, ms)
  const cs = Math.floor(clamped / 10) % 100
  const totalSec = Math.floor(clamped / 1000)
  const s = totalSec % 60
  const m = Math.floor(totalSec / 60) % 60
  const h = Math.floor(totalSec / 3600)
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

export function stopwatchToggleRunning(st: StopwatchRuntime, now = Date.now()): StopwatchRuntime {
  if (st.running && st.startedAt != null) {
    return {
      ...st,
      running: false,
      accumulatedMs: st.accumulatedMs + (now - st.startedAt),
      startedAt: null,
    }
  }
  return { ...st, running: true, startedAt: now }
}

export function stopwatchLap(st: StopwatchRuntime, now = Date.now()): StopwatchRuntime {
  if (!st.running) return st
  const totalMs = Math.round(getStopwatchElapsedMs(st, now))
  const prevTotal = st.laps[0]?.totalMs ?? 0
  const splitMs = Math.max(0, totalMs - prevTotal)
  const lapIndex = st.laps.length + 1
  const lap: StopwatchLap = { id: genId(), lapIndex, splitMs, totalMs }
  return { ...st, laps: [lap, ...st.laps] }
}

/** 按 id 删除一条打点，并按时间顺序重算计次与分段（展示仍为最新在上） */
export function stopwatchRemoveLap(st: StopwatchRuntime, lapId: string): StopwatchRuntime {
  const filtered = st.laps.filter((l) => l.id !== lapId)
  if (filtered.length === st.laps.length) return st
  const chronological = [...filtered].sort((a, b) => a.totalMs - b.totalMs)
  const rebuilt: StopwatchLap[] = chronological.map((lap, i) => {
    const prevTotal = i === 0 ? 0 : chronological[i - 1]!.totalMs
    return {
      ...lap,
      lapIndex: i + 1,
      splitMs: Math.max(0, lap.totalMs - prevTotal),
    }
  })
  rebuilt.reverse()
  return { ...st, laps: rebuilt }
}
