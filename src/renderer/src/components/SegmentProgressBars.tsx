import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { formatSegmentDurationCompact } from '../utils/durationFormat'

const barHeightClass = 'h-4'

/** 叠在条上、相对整段水平垂直居中，不随进度移动 */
const labelClass =
  'pointer-events-none absolute left-1/2 top-1/2 z-[1] max-w-[calc(100%-8px)] -translate-x-1/2 -translate-y-1/2 truncate text-center text-[10px] font-semibold tabular-nums text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.85),0_1px_2px_rgba(0,0,0,0.5)]'

function fillClassToVariant(fillClass: string): 'green' | 'blue' {
  return fillClass.includes('blue') ? 'blue' : 'green'
}

function useTextTruncated(ref: RefObject<HTMLElement | null>, text: string) {
  const [truncated, setTruncated] = useState(false)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    setTruncated(el.scrollWidth > el.clientWidth + 0.5)
  }, [])

  useLayoutEffect(() => {
    measure()
  }, [measure, text])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  return truncated
}

/** 仅在文案被截断时，hover 父级 .group 显示；尖角朝下指向进度条 */
function ProgressBarHoverBubble({
  show,
  label,
  variant,
}: {
  show: boolean
  label: string
  variant: 'green' | 'blue'
}) {
  if (!show) return null
  const bg = variant === 'blue' ? 'bg-blue-500' : 'bg-green-500'
  const tri = variant === 'blue' ? 'border-t-blue-500' : 'border-t-green-500'
  return (
    <div
      className="pointer-events-none absolute bottom-full left-1/2 z-[5] mb-0 flex -translate-x-1/2 flex-col items-center opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      role="tooltip"
    >
      <div
        className={`whitespace-nowrap rounded-md px-2 py-1 text-center text-[10px] font-semibold tabular-nums text-white shadow-md ${bg}`}
      >
        {label}
      </div>
      <div
        className={`h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent ${tri}`}
        aria-hidden
      />
    </div>
  )
}

type SplitSegmentBarProps = {
  durationMs: number
  /** 本段内已流逝比例 0~1（左灰右彩） */
  elapsedRatio: number
  fillClass: string
  showLabel?: boolean
  /** hover 时整条显示的背景色（用于结束态灰条 hover 恢复颜色） */
  hoverFillClass?: string
}

/** 列表子项：多段拆分，带动画比例 */
export function SplitSegmentProgressBar({ durationMs, elapsedRatio, fillClass, showLabel = true, hoverFillClass }: SplitSegmentBarProps) {
  const ratio = Math.max(0, Math.min(1, elapsedRatio))
  const label = formatSegmentDurationCompact(durationMs)
  const variant = fillClassToVariant(fillClass)
  const labelRef = useRef<HTMLSpanElement>(null)
  const truncated = useTextTruncated(labelRef, label)

  return (
    <div
      className="group relative min-w-0"
      style={{ flex: `${durationMs} 1 0`, minWidth: '6px' }}
      aria-label={label}
    >
      <div
        className={`relative ${barHeightClass} min-h-[1rem] w-full rounded-full overflow-hidden flex bg-slate-200`}
      >
        <div
          className="bg-slate-300/90 h-full transition-[width] duration-200 ease-out shrink-0"
          style={{ width: `${ratio * 100}%` }}
        />
        <div
          className={`h-full min-w-0 transition-[width] duration-200 ease-out ${fillClass}`}
          style={{ width: `${(1 - ratio) * 100}%` }}
        />
        {hoverFillClass && (
          <div className={`absolute inset-0 rounded-full ${hoverFillClass} opacity-0 group-hover:opacity-40 transition-opacity duration-150`} />
        )}
        {showLabel && (
          <span ref={labelRef} className={labelClass}>
            {label}
          </span>
        )}
      </div>
      <ProgressBarHoverBubble show={showLabel && truncated} label={label} variant={variant} />
    </div>
  )
}

type SingleBarProps = {
  totalDurationMs: number
  /** 与 Settings 一致：剩余比例，绿条宽度 = progressRatio */
  remainingRatio: number
  fillClass?: string
  hoverFillClass?: string
}

/** 列表子项：未拆分整段进度条 */
export function SingleCycleProgressBar({ totalDurationMs, remainingRatio, fillClass = 'bg-green-500', hoverFillClass }: SingleBarProps) {
  const pr = Math.max(0, Math.min(1, remainingRatio))
  const label = formatSegmentDurationCompact(totalDurationMs)
  const variant = fillClassToVariant(fillClass)
  const labelRef = useRef<HTMLSpanElement>(null)
  const truncated = useTextTruncated(labelRef, label)

  return (
    <div className="group relative w-full" aria-label={label}>
      <div className={`relative ${barHeightClass} min-h-[1rem] w-full rounded-full overflow-hidden flex bg-slate-200`}>
        <div
          className="bg-slate-300/90 h-full shrink-0 transition-[width] duration-300 ease-out"
          style={{ width: `${(1 - pr) * 100}%` }}
        />
        <div
          className={`${fillClass} h-full shrink-0 min-w-0 transition-[width] duration-300 ease-out`}
          style={{ width: `${pr * 100}%` }}
        />
        {hoverFillClass && (
          <div className={`absolute inset-0 rounded-full ${hoverFillClass} opacity-0 group-hover:opacity-40 transition-opacity duration-150`} />
        )}
        <span ref={labelRef} className={labelClass}>
          {label}
        </span>
      </div>
      <ProgressBarHoverBubble show={truncated} label={label} variant={variant} />
    </div>
  )
}

type StaticSegmentProps = {
  durationMs: number
  fillClass: string
}

/** 新建/编辑弹窗：静态拆分预览 */
export function StaticSplitPreviewSegment({ durationMs, fillClass }: StaticSegmentProps) {
  const label = formatSegmentDurationCompact(durationMs)
  const variant = fillClassToVariant(fillClass)
  const labelRef = useRef<HTMLSpanElement>(null)
  const truncated = useTextTruncated(labelRef, label)

  return (
    <div className="group relative min-w-0" style={{ flex: `${durationMs} 1 0`, minWidth: '6px' }} aria-label={label}>
      <div
        className={`relative ${barHeightClass} min-h-[1rem] w-full rounded-full overflow-hidden flex bg-slate-200`}
      >
        <div className={`h-full w-full ${fillClass}`} />
        <span ref={labelRef} className={labelClass}>
          {label}
        </span>
      </div>
      <ProgressBarHoverBubble show={truncated} label={label} variant={variant} />
    </div>
  )
}

/** 弹窗：未拆分时整根预览条 */
export function StaticSinglePreviewBar({ totalDurationMs }: { totalDurationMs: number }) {
  const label = formatSegmentDurationCompact(totalDurationMs)
  const labelRef = useRef<HTMLSpanElement>(null)
  const truncated = useTextTruncated(labelRef, label)

  return (
    <div className="group relative w-full" aria-label={label}>
      <div className={`relative ${barHeightClass} min-h-[1rem] w-full rounded-full overflow-hidden flex bg-slate-200`}>
        <div className="bg-green-500 h-full w-full min-w-0" />
        <span ref={labelRef} className={labelClass}>
          {label}
        </span>
      </div>
      <ProgressBarHoverBubble show={truncated} label={label} variant="green" />
    </div>
  )
}
