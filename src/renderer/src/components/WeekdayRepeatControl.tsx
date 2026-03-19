import { useEffect, useId, useRef, useState } from 'react'
import {
  WEEKDAY_LABELS_ZH,
  coalesceWeekdaysEnabled,
  formatWeekdaysSummary,
} from '../utils/weekdayRepeatUtils'

function IoSwitch({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${
        checked ? 'bg-green-500' : 'bg-slate-300'
      }`}
    >
      <span
        className={`pointer-events-none absolute top-[2px] left-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
          checked ? 'translate-x-[16px]' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export type WeekdayRepeatControlProps = {
  /** 未配置时按「每天」展示与编辑 */
  weekdaysEnabled: boolean[] | undefined
  onChange: (next: boolean[]) => void
  /** compact：列表子项一行；comfortable：弹窗内略宽 */
  variant?: 'compact' | 'comfortable'
}

export function WeekdayRepeatControl({
  weekdaysEnabled,
  onChange,
  variant = 'compact',
}: WeekdayRepeatControlProps) {
  const uid = useId()
  const days = coalesceWeekdaysEnabled(weekdaysEnabled)
  const summary = formatWeekdaysSummary(days)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

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
    variant === 'comfortable' ? 'min-w-[12rem] max-w-[20rem] w-full' : 'min-w-[7.5rem] max-w-[11rem] w-[11rem]'

  const toggleDay = (index: number) => {
    const next = days.slice()
    next[index] = !next[index]
    onChange(next)
  }

  return (
    <div ref={wrapRef} className="relative flex shrink-0 flex-col group">
      <div
        className={`flex h-9 shrink-0 items-stretch rounded border border-slate-300 bg-white ${shellW}`}
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
            className="box-border h-full w-full cursor-default border-0 bg-transparent px-0.5 py-0 text-left text-sm text-slate-800 outline-none ring-0 truncate"
            aria-label="重复星期摘要"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`flex w-6 shrink-0 items-center justify-center text-slate-400 transition-opacity duration-200 ease-out hover:text-slate-600 focus:outline-none ${open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          title="选择重复星期"
          aria-expanded={open}
          aria-label="选择重复星期"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={open ? 'rotate-180' : ''}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 min-w-0 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {WEEKDAY_LABELS_ZH.map((label, i) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-slate-50"
            >
              <label htmlFor={`${uid}-wd-${i}`} className="cursor-pointer text-sm text-slate-800 select-none">
                {label}
              </label>
              <IoSwitch id={`${uid}-wd-${i}`} checked={days[i]} onChange={() => toggleDay(i)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
