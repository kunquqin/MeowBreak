import { useState, useEffect, useRef } from 'react'

/** 主输入与预设行内控件同高 */
const CTRL_H = 'h-9'
const presetRowTextAreaClass = `min-h-[4.5rem] w-full min-w-0 rounded border border-slate-300 bg-white px-2 py-2 text-sm leading-6 box-border outline-none ring-0 resize-none overflow-hidden focus:outline-none focus:ring-0 focus:border-slate-400`
const presetActionBtnClass = `${CTRL_H} shrink-0 inline-flex items-center justify-center rounded px-2.5 text-xs font-medium leading-none hover:bg-slate-100`
const presetSaveBtnClass = `${presetActionBtnClass} text-slate-700`
const presetEditBtnClass = `${presetActionBtnClass} text-slate-600`
const presetDeleteBtnClass = `${presetActionBtnClass} text-red-600 hover:text-red-700`
const MAX_TEXT_CHARS = 50

function PresetDeleteButton({ onClick, title }: { onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={presetDeleteBtnClass}
      title={title ?? '删除'}
      aria-label={title ?? '删除'}
    >
      删除
    </button>
  )
}

const PRESET_DRAFT_PLACEHOLDER = '请输入提醒内容'

export type PresetTextFieldProps = {
  value: string
  onChange: (v: string) => void
  presets: string[]
  onPresetsChange: (presets: string[]) => void
  /** 主输入框占位 */
  mainPlaceholder: string
  resetKey: string
  /** 追加到主输入框的额外 class（如 text-center） */
  inputClassName?: string
  /** 是否自动聚焦主输入框 */
  autoFocusInput?: boolean
  /** 主输入框是否使用多行自适应高度（用于文案输入） */
  multilineMain?: boolean
}

/** 主输入 + 同宽预设下拉（子项标题、大类标题等） */
export function PresetTextField({
  value,
  onChange,
  presets,
  onPresetsChange,
  mainPlaceholder,
  resetKey,
  inputClassName,
  autoFocusInput = false,
  multilineMain = false,
}: PresetTextFieldProps) {
  const [presetOpen, setPresetOpen] = useState(false)
  const [editingPresetIndex, setEditingPresetIndex] = useState<number | null>(null)
  const [editBuffer, setEditBuffer] = useState('')
  const [newDraftActive, setNewDraftActive] = useState(false)
  const [newDraftText, setNewDraftText] = useState('')
  const [limitTipVisible, setLimitTipVisible] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const mainTextAreaRef = useRef<HTMLTextAreaElement>(null)
  const newDraftRef = useRef<HTMLTextAreaElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const limitTipTimerRef = useRef<number | null>(null)

  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.max(el.scrollHeight, 36)}px`
  }

  const clampText = (raw: string): string => {
    const chars = Array.from(raw)
    if (chars.length <= MAX_TEXT_CHARS) return raw
    if (limitTipTimerRef.current) window.clearTimeout(limitTipTimerRef.current)
    setLimitTipVisible(true)
    limitTipTimerRef.current = window.setTimeout(() => {
      setLimitTipVisible(false)
      limitTipTimerRef.current = null
    }, 1300)
    return chars.slice(0, MAX_TEXT_CHARS).join('')
  }

  const resetPicker = () => {
    setPresetOpen(false)
    setEditingPresetIndex(null)
    setEditBuffer('')
    setNewDraftActive(false)
    setNewDraftText('')
  }

  useEffect(() => {
    resetPicker()
  }, [resetKey])

  useEffect(() => {
    return () => {
      if (limitTipTimerRef.current) window.clearTimeout(limitTipTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!presetOpen) return
    const onDown = (e: MouseEvent) => {
      const el = wrapRef.current
      if (el && !el.contains(e.target as Node)) resetPicker()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [presetOpen])

  useEffect(() => {
    if (!presetOpen || !newDraftActive) return
    const el = listRef.current
    if (!el) return
    el.scrollTop = 0
  }, [presetOpen, newDraftActive])

  useEffect(() => {
    if (multilineMain) autoResize(mainTextAreaRef.current)
  }, [value, multilineMain])

  useEffect(() => {
    if (newDraftActive) autoResize(newDraftRef.current)
  }, [newDraftActive, newDraftText])

  useEffect(() => {
    if (editingPresetIndex !== null) autoResize(editRef.current)
  }, [editingPresetIndex, editBuffer])

  /** Esc 先关预设面板（捕获阶段，避免一并关掉整弹窗） */
  useEffect(() => {
    if (!presetOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      resetPicker()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [presetOpen])

  const rowClass = 'flex items-center gap-2 px-2 py-1'

  return (
    <div ref={wrapRef} className="relative w-full">
      {multilineMain ? (
        <textarea
          ref={mainTextAreaRef}
          autoFocus={autoFocusInput}
          value={value}
          onChange={(e) => onChange(clampText(e.target.value))}
          onInput={(e) => autoResize(e.currentTarget)}
          placeholder={mainPlaceholder}
          maxLength={MAX_TEXT_CHARS}
          className={`min-h-[2.25rem] w-full rounded border border-slate-300 pl-2 pr-9 py-1.5 text-sm leading-6 box-border outline-none ring-0 resize-none overflow-hidden placeholder:text-slate-300 focus:outline-none focus:ring-0 focus:border-slate-400${inputClassName ? ` ${inputClassName}` : ''}`}
        />
      ) : (
        <input
          type="text"
          autoComplete="off"
          autoFocus={autoFocusInput}
          value={value}
          onChange={(e) => onChange(clampText(e.target.value))}
          placeholder={mainPlaceholder}
          maxLength={MAX_TEXT_CHARS}
          className={`${CTRL_H} w-full rounded border border-slate-300 pl-2 pr-9 text-sm leading-9 box-border outline-none ring-0 placeholder:text-slate-300 focus:outline-none focus:ring-0 focus:border-slate-400${inputClassName ? ` ${inputClassName}` : ''}`}
        />
      )}
      {limitTipVisible && (
        <div className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-[115%] rounded bg-slate-800/95 px-2 py-1 text-xs text-white shadow">
          最多输入 50 字
        </div>
      )}
      <div className={`absolute right-2 top-1/2 -translate-y-1/2 ${CTRL_H} flex items-center`}>
        <button
          type="button"
          onClick={() => (presetOpen ? resetPicker() : setPresetOpen(true))}
          className="text-slate-400 hover:text-slate-600 p-0.5 inline-flex items-center justify-center"
          title="预设"
          aria-expanded={presetOpen}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={presetOpen ? 'rotate-180' : ''}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
      {presetOpen && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 flex max-h-72 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
            {newDraftActive && (
              <div className={`${rowClass} ${presets.length > 0 ? 'border-b border-slate-100' : ''}`}>
                <textarea
                  ref={newDraftRef}
                  autoFocus
                  value={newDraftText}
                  onChange={(e) => setNewDraftText(clampText(e.target.value))}
                  onInput={(e) => autoResize(e.currentTarget)}
                  placeholder={PRESET_DRAFT_PLACEHOLDER}
                  maxLength={MAX_TEXT_CHARS}
                  className={`${presetRowTextAreaClass} placeholder:text-slate-300`}
                />
                {newDraftText.trim() !== '' && (
                  <button
                    type="button"
                    className={presetSaveBtnClass}
                    onClick={(e) => {
                      e.stopPropagation()
                      const v = newDraftText.trim()
                      if (!v) return
                      onPresetsChange([v, ...presets])
                      setNewDraftActive(false)
                      setNewDraftText('')
                    }}
                  >
                    保存
                  </button>
                )}
                <PresetDeleteButton
                  title="取消新增"
                  onClick={() => {
                    setNewDraftActive(false)
                    setNewDraftText('')
                  }}
                />
              </div>
            )}
            {presets.map((p, i) => {
              const isEditing = editingPresetIndex === i
              if (isEditing) {
                return (
                  <div key={`e-${i}-${p}`} className={rowClass}>
                    <textarea
                      ref={editRef}
                      value={editBuffer}
                      onChange={(e) => setEditBuffer(clampText(e.target.value))}
                      onInput={(e) => autoResize(e.currentTarget)}
                      placeholder={PRESET_DRAFT_PLACEHOLDER}
                      maxLength={MAX_TEXT_CHARS}
                      className={`${presetRowTextAreaClass} placeholder:text-slate-300`}
                    />
                    {editBuffer.trim() !== '' && (
                      <button
                        type="button"
                        className={presetSaveBtnClass}
                        onClick={(e) => {
                          e.stopPropagation()
                          const v = editBuffer.trim()
                          if (!v) return
                          const next = presets.slice()
                          next[i] = v
                          onPresetsChange(next)
                          setEditingPresetIndex(null)
                          setEditBuffer('')
                        }}
                      >
                        保存
                      </button>
                    )}
                    <PresetDeleteButton
                      title="删除预设"
                      onClick={() => {
                        const next = presets.filter((_, j) => j !== i)
                        onPresetsChange(next)
                        setEditingPresetIndex(null)
                        setEditBuffer('')
                      }}
                    />
                  </div>
                )
              }
              return (
                <div key={`d-${i}-${p}`} className={`group ${rowClass} items-start hover:bg-slate-50`}>
                  <button
                    type="button"
                    className={`min-w-0 flex-1 whitespace-normal break-words py-1 text-left text-sm leading-6 text-slate-800`}
                    onClick={() => {
                      onChange(p ?? '')
                      resetPicker()
                    }}
                  >
                    {p || '(空)'}
                  </button>
                  <div className="flex shrink-0 items-center gap-2 opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto">
                    <button
                      type="button"
                      className={presetEditBtnClass}
                      onClick={(e) => {
                        e.stopPropagation()
                        setNewDraftActive(false)
                        setNewDraftText('')
                        setEditingPresetIndex(i)
                        setEditBuffer(p ?? '')
                      }}
                    >
                      编辑
                    </button>
                    <PresetDeleteButton
                      title="删除预设"
                      onClick={() => {
                        const next = presets.filter((_, j) => j !== i)
                        onPresetsChange(next)
                        if (editingPresetIndex === i) {
                          setEditingPresetIndex(null)
                          setEditBuffer('')
                        } else if (editingPresetIndex !== null && editingPresetIndex > i) {
                          setEditingPresetIndex(editingPresetIndex - 1)
                        }
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="shrink-0 border-t border-slate-200 p-1.5">
            <button
              type="button"
              disabled={newDraftActive}
              className="flex h-9 w-full items-center justify-center rounded-md border border-dashed border-slate-300 text-base font-medium leading-none text-slate-600 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                if (newDraftActive) return
                setEditingPresetIndex(null)
                setEditBuffer('')
                setNewDraftActive(true)
                setNewDraftText('')
                if (listRef.current) listRef.current.scrollTop = 0
              }}
              aria-label="新增预设"
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
