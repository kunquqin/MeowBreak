import { useEffect, useId, useRef, useState } from 'react'
import {
  WEEKDAY_LABELS_ZH,
  coalesceWeekdaysEnabled,
  formatWeekdaysSummary,
} from '../utils/weekdayRepeatUtils'

export type WeekdayRepeatControlProps = {
  /** 未配置时按「每天」展示与编辑 */
  weekdaysEnabled: boolean[] | undefined
  onChange: (next: boolean[]) => void
  /** compact：列表子项一行；comfortable：弹窗内略宽 */
  variant?: 'compact' | 'comfortable'
  /** 组件挂载后自动展开下拉 */
  autoOpenOnMount?: boolean
}

export function WeekdayRepeatControl({
  weekdaysEnabled,
  onChange,
  variant = 'compact',
  autoOpenOnMount = false,
}: WeekdayRepeatControlProps) {
  const uid = useId()
  const days = coalesceWeekdaysEnabled(weekdaysEnabled)
  const summary = formatWeekdaysSummary(days)
  const [open, setOpen] = useState(false)
  const [dragToggleValue, setDragToggleValue] = useState<boolean | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const ignoreNextSwitchClickRef = useRef(false)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (dragToggleValue === null) return
    const onUp = () => {
      setDragToggleValue(null)
      // 清理“拖拽触发后的紧随 click”，避免同一开关被反向再切一次
      setTimeout(() => {
        ignoreNextSwitchClickRef.current = false
      }, 0)
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [dragToggleValue])

  useEffect(() => {
    if (!autoOpenOnMount) return
    setOpen(true)
  }, [autoOpenOnMount])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  const shellW =
    variant === 'comfortable' ? 'min-w-[12rem] max-w-[20rem] w-full' : 'min-w-[6.5rem] max-w-[8.5rem] w-[8.5rem]'

  const toggleDay = (index: number) => {
    const next = days.slice()
    next[index] = !next[index]
    onChange(next)
  }

  const setDay = (index: number, value: boolean) => {
    if (days[index] === value) return
    const next = days.slice()
    next[index] = value
    onChange(next)
  }

  const startDragToggle = (index: number, e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const target = !days[index]
    setDay(index, target)
    setDragToggleValue(target)
    ignoreNextSwitchClickRef.current = true
  }

  const dragPaintToggle = (index: number) => {
    if (dragToggleValue === null) return
    setDay(index, dragToggleValue)
  }

  const handleSwitchClick = (index: number, e: React.MouseEvent<HTMLButtonElement>) => {
    if (ignoreNextSwitchClickRef.current) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    toggleDay(index)
  }

  return (
    <div ref={wrapRef} className="relative flex shrink-0 flex-col group">
      <div
        className={`flex h-8 shrink-0 cursor-pointer items-stretch rounded border border-slate-300 bg-white ${shellW}`}
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((o) => !o)
          }
        }}
      >
        <span className="flex w-6 shrink-0 items-center justify-center text-slate-500 pointer-events-none" title="重复星期">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </span>
        <div className="group/summary relative min-w-0 flex-1">
          <input
            type="text"
            readOnly
            value={summary}
            title={summary}
            className="box-border h-full w-full cursor-pointer border-0 bg-transparent px-0.5 py-0 text-left text-sm leading-5 text-slate-800 outline-none ring-0 truncate"
            aria-label="重复星期摘要"
            tabIndex={-1}
          />
        </div>
        <span
          className="flex w-6 shrink-0 items-center justify-center text-slate-400"
          aria-hidden
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={open ? 'rotate-180' : ''}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </div>
      {open && (
        <div
          className={
            variant === 'comfortable'
              ? 'absolute left-0 right-0 top-full z-30 mt-1 min-w-0 rounded-lg border border-slate-200 bg-white py-1 shadow-lg'
              : 'absolute left-1/2 top-full z-30 mt-1 w-[8.5rem] -translate-x-1/2 rounded-lg border border-slate-200 bg-white py-1 shadow-lg'
          }
        >
          {WEEKDAY_LABELS_ZH.map((label, i) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-slate-50"
            >
              <label htmlFor={`${uid}-wd-${i}`} className="cursor-pointer text-sm text-slate-800 select-none">
                {label}
              </label>
              <button
                id={`${uid}-wd-${i}`}
                type="button"
                role="switch"
                aria-checked={days[i]}
                onMouseDown={(e) => startDragToggle(i, e)}
                onMouseEnter={() => dragPaintToggle(i)}
                onClick={(e) => handleSwitchClick(i, e)}
                className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${
                  days[i] ? 'bg-green-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none absolute top-[2px] left-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
                    days[i] ? 'translate-x-[16px]' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
