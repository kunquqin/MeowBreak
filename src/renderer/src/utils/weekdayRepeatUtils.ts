/** 与 Date.getDay() 一致：0=周日 … 6=周六 */
export const WEEKDAY_LABELS_ZH = ['每周日', '每周一', '每周二', '每周三', '每周四', '每周五', '每周六'] as const

export const ALL_WEEKDAYS_ENABLED: boolean[] = [true, true, true, true, true, true, true]

export function coalesceWeekdaysEnabled(raw?: boolean[] | null): boolean[] {
  if (!Array.isArray(raw) || raw.length !== 7) return [...ALL_WEEKDAYS_ENABLED]
  return raw.map((x) => Boolean(x))
}

/** 是否显式配置了 7 项（含全 false） */
export function hasWeekdayMask(raw?: boolean[] | null): raw is boolean[] {
  return Array.isArray(raw) && raw.length === 7
}

export function formatWeekdaysSummary(days: boolean[]): string {
  if (days.length !== 7) return '每天'
  if (days.every(Boolean)) return '每天'
  if (!days.some(Boolean)) return '永不'
  const parts: string[] = []
  for (let i = 0; i < 7; i++) {
    if (days[i]) parts.push(WEEKDAY_LABELS_ZH[i])
  }
  return parts.join('、')
}
