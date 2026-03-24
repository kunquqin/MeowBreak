/**
 * 弹窗遮罩：纯色 / 线性渐变背景 CSS（预览与主进程 HTML 共用）
 */
import type { PopupTheme } from './settings'

function clampOpacity(v: number | undefined, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(1, n))
}

function normalizeAngleDeg(v: number | undefined, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  const mod = n % 360
  return mod < 0 ? mod + 360 : mod
}

function hexToRgba(hex: string, alpha: number): string {
  const a = clampOpacity(alpha, 1)
  const raw = (hex || '').trim()
  const m = raw.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (!m) return `rgba(0,0,0,${a})`
  const h = m[1].length === 3
    ? m[1].split('').map((c) => c + c).join('')
    : m[1]
  const r = Number.parseInt(h.slice(0, 2), 16)
  const g = Number.parseInt(h.slice(2, 4), 16)
  const b = Number.parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

function overlayGradientAngleFromTheme(theme: {
  overlayGradientDirection?: PopupTheme['overlayGradientDirection']
  overlayGradientAngleDeg?: number
}): number {
  const dir = theme.overlayGradientDirection ?? 'leftToRight'
  if (dir === 'custom') return normalizeAngleDeg(theme.overlayGradientAngleDeg, 90)
  if (dir === 'rightToLeft') return 270
  if (dir === 'topToBottom') return 180
  if (dir === 'bottomToTop') return 0
  if (dir === 'topLeftToBottomRight') return 135
  if (dir === 'topRightToBottomLeft') return 225
  if (dir === 'bottomLeftToTopRight') return 45
  if (dir === 'bottomRightToTopLeft') return 315
  return 90
}

/** 渐变过渡结束位置（沿渐变方向从起点起的百分比），1–100；缺省 100 即与旧版「铺满」一致 */
export function clampOverlayGradientRangePct(v: number | undefined): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 100
  return Math.max(1, Math.min(100, Math.round(n)))
}

export type PopupOverlayBackgroundFields = Pick<
  PopupTheme,
  | 'overlayColor'
  | 'overlayMode'
  | 'overlayOpacity'
  | 'overlayGradientDirection'
  | 'overlayGradientAngleDeg'
  | 'overlayGradientStartOpacity'
  | 'overlayGradientEndOpacity'
  | 'overlayGradientRangePct'
>

export function buildPopupOverlayBackgroundCss(theme: PopupOverlayBackgroundFields): string {
  const color = theme.overlayColor || '#000000'
  const mode = theme.overlayMode === 'gradient' ? 'gradient' : 'solid'
  if (mode !== 'gradient') {
    return hexToRgba(color, clampOpacity(theme.overlayOpacity, 0.45))
  }
  const start = clampOpacity(theme.overlayGradientStartOpacity, 0.7)
  const end = clampOpacity(theme.overlayGradientEndOpacity, 0)
  const angle = overlayGradientAngleFromTheme(theme)
  const range = clampOverlayGradientRangePct(theme.overlayGradientRangePct)
  const rgbaStart = hexToRgba(color, start)
  const rgbaEnd = hexToRgba(color, end)
  if (range >= 100) {
    return `linear-gradient(${angle}deg, ${rgbaStart} 0%, ${rgbaEnd} 100%)`
  }
  return `linear-gradient(${angle}deg, ${rgbaStart} 0%, ${rgbaEnd} ${range}%, ${rgbaEnd} 100%)`
}
