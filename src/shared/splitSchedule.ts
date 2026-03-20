export type SplitSegment = { type: 'work' | 'rest'; durationMs: number }

export interface SplitSchedule {
  valid: boolean
  splitCount: number
  restDurationMs: number
  totalDurationMs: number
  totalWorkMs: number
  totalRestMs: number
  workDurationsMs: number[]
  segments: SplitSegment[]
  cycleTotalMs: number
}

function clampSplitCount(splitCount: number | undefined): number {
  const n = Number(splitCount ?? 1)
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(10, Math.floor(n)))
}

/**
 * 统一拆分语义：
 * - totalDurationMs 表示“整轮总时长”（含中间休息）
 * - restDurationMs 为每段中间休息时长
 * - workDurationsMs 为拆分后的各段工作时长（均分余数前置）
 *
 * invalid 时返回回退计划：不拆分（splitCount=1，整段工作=totalDurationMs）。
 */
export function buildSplitSchedule(
  totalDurationMs: number,
  splitCount: number | undefined,
  restDurationMs: number | undefined
): SplitSchedule {
  const total = Math.max(0, Math.floor(totalDurationMs))
  const split = clampSplitCount(splitCount)
  const rest = Math.max(0, Math.floor(restDurationMs ?? 0))

  if (split <= 1 || total <= 0) {
    return {
      valid: true,
      splitCount: 1,
      restDurationMs: 0,
      totalDurationMs: total,
      totalWorkMs: total,
      totalRestMs: 0,
      workDurationsMs: [total],
      segments: [{ type: 'work', durationMs: total }],
      cycleTotalMs: total,
    }
  }

  const restSlots = split - 1
  const totalRest = rest * restSlots
  const totalWork = total - totalRest
  const base = Math.floor(totalWork / split)
  const rem = totalWork - base * split

  if (totalWork <= 0 || base <= 0) {
    return {
      valid: false,
      splitCount: 1,
      restDurationMs: 0,
      totalDurationMs: total,
      totalWorkMs: total,
      totalRestMs: 0,
      workDurationsMs: [total],
      segments: [{ type: 'work', durationMs: total }],
      cycleTotalMs: total,
    }
  }

  const workDurationsMs = Array.from({ length: split }, (_, i) => base + (i < rem ? 1 : 0))
  const segments: SplitSegment[] = []
  for (let i = 0; i < split; i++) {
    segments.push({ type: 'work', durationMs: workDurationsMs[i] })
    if (i < split - 1 && rest > 0) segments.push({ type: 'rest', durationMs: rest })
  }
  const cycleTotalMs = workDurationsMs.reduce((s, x) => s + x, 0) + totalRest
  return {
    valid: true,
    splitCount: split,
    restDurationMs: rest,
    totalDurationMs: total,
    totalWorkMs: workDurationsMs.reduce((s, x) => s + x, 0),
    totalRestMs: totalRest,
    workDurationsMs,
    segments,
    cycleTotalMs,
  }
}
