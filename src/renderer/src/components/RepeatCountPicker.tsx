import { useEffect, useRef, useState } from 'react'

function RepeatArrowsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  )
}

export type RepeatCountPickerProps = {
  value: number | null
  onChange: (next: number | null) => void
}

/** 重复次数：与设置页现有 RepeatControl 外观一致，但在弹窗内自管理展开/聚焦态 */
export function RepeatCountPicker({ value, onChange }: RepeatCountPickerProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [repeatInputFocused, setRepeatInputFocused] = useState(false)
  const [repeatDraft, setRepeatDraft] = useState('')
  const [open, setOpen] = useState(false)

  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  useEffect(() => {
    if (!repeatInputFocused) return
    setRepeatDraft(value === null ? '' : String(value))
  }, [value, repeatInputFocused])

  const repeatDisplayValue = repeatInputFocused
    ? repeatDraft
    : value === null
      ? '∞'
      : String(value)

  const commitRepeatFromDraft = (rawDigits: string) => {
    if (rawDigits === '') {
      onChange(null)
      return
    }
    const n = Math.max(1, Math.min(999, parseInt(rawDigits, 10) || 1))
    onChange(n)
  }

  return (
    <div ref={wrapRef} className="relative flex shrink-0 group">
      <div className="flex h-9 w-[5.25rem] shrink-0 items-stretch rounded border border-slate-300 bg-white">
        <span className="flex w-6 shrink-0 items-center justify-center text-slate-500 pointer-events-none" title="重复次数">
          <RepeatArrowsIcon className="scale-90" />
        </span>
        <div className="flex w-9 shrink-0 items-center justify-center overflow-hidden px-0.5">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            readOnly={!repeatInputFocused && value === null}
            title={value === null && !repeatInputFocused ? '点击输入数字；无限重复' : '重复次数'}
            value={repeatDisplayValue}
            onFocus={() => {
              setRepeatInputFocused(true)
              setRepeatDraft(value === null ? '' : String(value))
            }}
            onBlur={(e) => {
              setRepeatInputFocused(false)
              const raw = (e.target as HTMLInputElement).value.replace(/\D/g, '')
              commitRepeatFromDraft(raw)
              setRepeatDraft('')
            }}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, '')
              setRepeatDraft(raw)
              commitRepeatFromDraft(raw)
            }}
            className="box-border h-full w-full cursor-text border-0 bg-transparent py-0 text-center text-sm tabular-nums outline-none ring-0 focus:ring-0"
            aria-label="重复次数"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`flex w-6 shrink-0 items-center justify-center text-slate-400 transition-opacity duration-200 ease-out hover:text-slate-600 focus:outline-none ${open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          title="重复选项"
          aria-label="重复选项"
          aria-expanded={open}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 flex min-w-full w-max flex-col rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-base leading-none hover:bg-slate-100"
            onClick={() => {
              onChange(null)
              close()
            }}
            aria-label="无限重复"
            title="无限重复"
          >
            ∞
          </button>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <button
              key={n}
              type="button"
              className="block w-full px-3 py-1.5 text-left text-sm tabular-nums hover:bg-slate-100"
              onClick={() => {
                onChange(n)
                close()
              }}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

