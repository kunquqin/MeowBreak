/**
 * 段总时长展示：只含非零单位，如 30 分钟 →「30分」，1 时 0 分 30 秒 →「1时30秒」
 */
export function formatSegmentDurationCompact(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h}时`)
  if (m > 0) parts.push(`${m}分`)
  if (s > 0) parts.push(`${s}秒`)
  if (parts.length === 0) return '0秒'
  return parts.join('')
}
