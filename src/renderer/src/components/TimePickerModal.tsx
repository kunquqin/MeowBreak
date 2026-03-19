import React, { useCallback, useEffect, useRef, useState, memo } from 'react'

/** 解析 HH:mm 或 H:mm，非法时回退 12:00 */
export function parseTimeHHmm(s: string): { h: number; m: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s?.trim() ?? '')
  if (!m) return { h: 12, m: 0 }
  let h = parseInt(m[1], 10)
  let min = parseInt(m[2], 10)
  if (Number.isNaN(h) || Number.isNaN(min)) return { h: 12, m: 0 }
  h = Math.max(0, Math.min(23, h))
  min = Math.max(0, Math.min(59, min))
  return { h, m: min }
}

export function formatHHmm(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 单行高度（与原先顶部「大时间」视觉接近，略放大） */
const ITEM_H = 52
const VISIBLE = 5
const PAD = ((VISIBLE - 1) / 2) * ITEM_H
export const WHEEL_VIEW_H = ITEM_H * VISIBLE
const MIDDLE_BLOCK = 2
const TOTAL_BLOCKS = 5

const hideScrollbar =
  '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'

const WheelRow = memo(
  function WheelRow({ v, selected }: { v: number; selected: boolean }) {
    return (
      <div
        role="option"
        aria-selected={selected}
        data-wheel-row={v}
        className={`snap-center shrink-0 w-full flex items-center justify-center text-2xl tabular-nums leading-none rounded ${
          selected ? 'text-slate-900 font-semibold' : 'text-slate-300 font-normal'
        }`}
        style={{ minHeight: ITEM_H, height: ITEM_H }}
      >
        {String(v).padStart(2, '0')}
      </div>
    )
  },
  (a, b) => a.v === b.v && a.selected === b.selected
)

type WheelColumnProps = {
  label: string
  min: number
  max: number
  value: number
  onChange: (v: number) => void
  onLiveChange?: (v: number) => void
}

export function WheelColumn({ label, min, max, value, onChange, onLiveChange }: WheelColumnProps) {
  const ref = useRef<HTMLDivElement>(null)
  const normalizingRef = useRef(false)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)
  const draggingRef = useRef(false)
  const suppressClickRef = useRef(false)
  const wheelLockUntilRef = useRef<number>(0)

  const [live, setLive] = useState(value)
  const [dragging, setDragging] = useState(false)
  /** 与 live 同步，供 flushScrollToLive 在 setState 之外比较，避免在 setState updater 内调用 emitLive（会触发父组件 setState，违反 React 规则） */
  const liveRef = useRef(value)
  liveRef.current = live

  const range = max - min + 1
  const totalItems = TOTAL_BLOCKS * range

  const indexToValue = useCallback(
    (i: number) => min + ((((i % range) + range) % range) as number),
    [min, range]
  )

  const scrollToIndex = useCallback(
    (i: number, behavior: ScrollBehavior = 'auto') => {
      const el = ref.current
      if (!el) return
      const clamped = Math.max(0, Math.min(totalItems - 1, i))
      normalizingRef.current = true
      el.scrollTo({ top: clamped * ITEM_H, behavior })
      requestAnimationFrame(() => {
        normalizingRef.current = false
      })
    },
    [totalItems]
  )

  const scrollToValue = useCallback(
    (v: number, behavior: ScrollBehavior = 'auto') => {
      const idx = MIDDLE_BLOCK * range + (v - min)
      scrollToIndex(idx, behavior)
    },
    [min, range, scrollToIndex]
  )

  const emitLive = useCallback(
    (val: number) => {
      onLiveChange?.(val)
    },
    [onLiveChange]
  )

  const flushScrollToLive = useCallback(() => {
    const el = ref.current
    if (!el || normalizingRef.current) return
    const i = Math.round(el.scrollTop / ITEM_H)
    const val = indexToValue(i)
    if (liveRef.current === val) return
    liveRef.current = val
    setLive(val)
    emitLive(val)
  }, [indexToValue, emitLive])

  const scheduleFlush = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      flushScrollToLive()
    })
  }, [flushScrollToLive])

  /** 受控 value 从父组件更新时（如新建闹钟默认改为「当前时间」）必须重新对齐滚动，不能只依赖挂载时的一次同步 */
  useEffect(() => {
    scrollToValue(value, 'auto')
    liveRef.current = value
    setLive(value)
    emitLive(value)
  }, [value, scrollToValue, emitLive])

  const normalizeIfNeeded = useCallback(() => {
    const el = ref.current
    if (!el || normalizingRef.current) return
    const i = Math.round(el.scrollTop / ITEM_H)
    const val = indexToValue(i)
    const targetIdx = MIDDLE_BLOCK * range + (val - min)
    if (i !== targetIdx) {
      scrollToIndex(targetIdx, 'auto')
    }
  }, [indexToValue, min, range, scrollToIndex])

  const settle = useCallback(() => {
    if (normalizingRef.current) return
    normalizeIfNeeded()
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el || normalizingRef.current) return
      const i = Math.round(el.scrollTop / ITEM_H)
      const val = indexToValue(i)
      liveRef.current = val
      setLive(val)
      emitLive(val)
      onChange(val)
    })
  }, [normalizeIfNeeded, indexToValue, emitLive, onChange])

  const onScroll = () => {
    if (normalizingRef.current) return
    scheduleFlush()

    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null
      if (!draggingRef.current) settle()
    }, 64)
  }

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  /** React 的 onWheel 在 Chromium 上常为 passive，preventDefault 无效且控制台报错；需原生监听 passive: false */
  const onWheelRef = useRef<(e: WheelEvent) => void>(() => {})
  onWheelRef.current = (e: WheelEvent) => {
    const el = ref.current
    if (!el) return
    if (e.deltaY === 0) return
    e.preventDefault()
    e.stopPropagation()

    const now = Date.now()
    if (now < wheelLockUntilRef.current) return
    wheelLockUntilRef.current = now + 70

    const dir = e.deltaY > 0 ? 1 : -1
    const i = Math.round(el.scrollTop / ITEM_H)
    const nextIndex = i + dir

    normalizingRef.current = true
    el.scrollTop = Math.max(0, Math.min(totalItems - 1, nextIndex)) * ITEM_H
    normalizingRef.current = false

    const val = indexToValue(nextIndex)
    liveRef.current = val
    setLive(val)
    emitLive(val)
    onChange(val)

    requestAnimationFrame(() => {
      normalizeIfNeeded()
    })
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const listener = (e: WheelEvent) => onWheelRef.current(e)
    el.addEventListener('wheel', listener, { passive: false })
    return () => el.removeEventListener('wheel', listener)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const el = ref.current
    if (!el) return

    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }

    const startY = e.clientY
    const startScroll = el.scrollTop
    let dragActive = false

    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - startY
      if (!dragActive) {
        if (Math.abs(dy) < 6) return
        dragActive = true
        draggingRef.current = true
        setDragging(true)
      }
      el.scrollTop = startScroll - dy
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (dragActive) {
        suppressClickRef.current = true
        draggingRef.current = false
        setDragging(false)
        settle()
      }
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const pickValue = useCallback(
    (v: number) => {
      liveRef.current = v
      setLive(v)
      emitLive(v)
      onChange(v)
      scrollToValue(v, 'auto')
      requestAnimationFrame(() => {
        normalizeIfNeeded()
      })
    },
    [onChange, emitLive, scrollToValue, normalizeIfNeeded]
  )

  const onWheelRowClick = useCallback(
    (e: React.MouseEvent) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        e.preventDefault()
        e.stopPropagation()
        return
      }
      const t = (e.target as HTMLElement).closest('[data-wheel-row]')
      if (!t) return
      const raw = t.getAttribute('data-wheel-row')
      if (raw == null) return
      pickValue(Number(raw))
    },
    [pickValue]
  )

  return (
    <div className={`flex flex-col items-center min-w-[4.5rem] select-none ${label ? 'gap-1' : ''}`}>
      {label ? <span className="text-xs text-slate-500 font-medium">{label}</span> : null}
      <div className="relative">
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 bg-slate-50/90 rounded-md z-0"
          style={{ height: ITEM_H }}
          aria-hidden
        />
        <div
          ref={ref}
          role="listbox"
          tabIndex={0}
          className={`relative z-10 w-[4.25rem] overflow-y-auto scroll-auto overscroll-contain touch-pan-y ${hideScrollbar} ${
            dragging ? 'snap-none' : 'snap-y snap-mandatory'
          } ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{
            height: WHEEL_VIEW_H,
            scrollPaddingTop: PAD,
            scrollPaddingBottom: PAD,
            paddingTop: PAD,
            paddingBottom: PAD,
            willChange: 'scroll-position',
          }}
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onClick={onWheelRowClick}
        >
          {Array.from({ length: totalItems }, (_, i) => {
            const v = indexToValue(i)
            return <WheelRow key={i} v={v} selected={live === v} />
          })}
        </div>
      </div>
    </div>
  )
}

/** 时钟图标，用于列表中打开完整编辑弹窗 */
export function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}
