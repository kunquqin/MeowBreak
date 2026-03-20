/**
 * 段总时长展示：只含非零单位，如 30 分钟 →「30分」，1 时 0 分 30 秒 →「1时30秒」
 */
export function formatSegmentDurationCompact(ms: number): string {
  const totalMs = Math.max(0, Math.round(ms))
  const h = Math.floor(totalMs / 3_600_000)
  const m = Math.floor((totalMs % 3_600_000) / 60_000)
  const secFloat = (totalMs % 60_000) / 1000
  const secInt = Math.floor(secFloat)
  const hasFraction = Math.abs(secFloat - secInt) > 1e-6
  const parts: string[] = []
  if (h > 0) parts.push(`${h}时`)
  if (m > 0) parts.push(`${m}分`)
  if (secFloat > 0) {
    if (hasFraction) {
      parts.push(`${secFloat.toFixed(1)}秒`)
    } else {
      parts.push(`${secInt}秒`)
    }
  }
  if (parts.length === 0) return '0秒'
  return parts.join('')
}
