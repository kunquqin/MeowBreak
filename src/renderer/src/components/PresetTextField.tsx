import { useState, useEffect, useRef } from 'react'

/** 主输入与预设行内控件同高 */
const CTRL_H = 'h-9'
const presetRowInputClass = `${CTRL_H} w-full min-w-0 rounded border border-slate-300 bg-white px-2 text-sm leading-9 box-border outline-none ring-0 focus:outline-none focus:ring-0 focus:border-slate-400`
const presetSaveBtnClass = `${CTRL_H} min-w-[52px] shrink-0 inline-flex items-center justify-center rounded bg-slate-800 px-2.5 text-xs font-medium leading-none text-white hover:bg-slate-700`
const presetEditBtnClass = `${CTRL_H} shrink-0 inline-flex items-center justify-center rounded border border-slate-300 px-2.5 text-xs font-medium leading-none text-slate-600 hover:bg-slate-100`

function PresetDeleteButton({ onClick, title }: { onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-full bg-red-500 text-xs font-bold leading-none text-white hover:bg-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-0`}
      title={title ?? '删除'}
      aria-label={title ?? '删除'}
    >
      −
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
}

/** 提醒内容 / 休息弹窗文案：主输入 + 同宽预设下拉（列表子项与 AddSubReminderModal 共用） */
export function PresetTextField({
  value,
  onChange,
  presets,
  onPresetsChange,
  mainPlaceholder,
  resetKey,
  inputClassName,
}: PresetTextFieldProps) {
  const [presetOpen, setPresetOpen] = useState(false)
  const [editingPresetIndex, setEditingPresetIndex] = useState<number | null>(null)
  const [editBuffer, setEditBuffer] = useState('')
  const [newDraftActive, setNewDraftActive] = useState(false)
  const [newDraftText, setNewDraftText] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

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
    if (!presetOpen) return
    const onDown = (e: MouseEvent) => {
      const el = wrapRef.current
      if (el && !el.contains(e.target as Node)) resetPicker()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [presetOpen])

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
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={mainPlaceholder}
        className={`${CTRL_H} w-full rounded border border-slate-300 pl-2 pr-9 text-sm leading-9 box-border outline-none ring-0 placeholder:text-slate-300 focus:outline-none focus:ring-0 focus:border-slate-400${inputClassName ? ` ${inputClassName}` : ''}`}
      />
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
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {presets.map((p, i) => {
              const isEditing = editingPresetIndex === i
              if (isEditing) {
                return (
                  <div key={`e-${i}-${p}`} className={rowClass}>
                    <input
                      type="text"
                      value={editBuffer}
                      onChange={(e) => setEditBuffer(e.target.value)}
                      placeholder={PRESET_DRAFT_PLACEHOLDER}
                      className={`${presetRowInputClass} placeholder:text-slate-300`}
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
                <div key={`d-${i}-${p}`} className={`group ${rowClass} hover:bg-slate-50`}>
                  <button
                    type="button"
                    className={`${CTRL_H} min-w-0 flex-1 truncate text-left text-sm leading-9 text-slate-800`}
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
            {newDraftActive && (
              <div className={`${rowClass} ${presets.length > 0 ? 'border-t border-slate-100' : ''}`}>
                <input
                  type="text"
                  value={newDraftText}
                  onChange={(e) => setNewDraftText(e.target.value)}
                  placeholder={PRESET_DRAFT_PLACEHOLDER}
                  className={`${presetRowInputClass} placeholder:text-slate-300`}
                />
                {newDraftText.trim() !== '' && (
                  <button
                    type="button"
                    className={presetSaveBtnClass}
                    onClick={(e) => {
                      e.stopPropagation()
                      const v = newDraftText.trim()
                      if (!v) return
                      onPresetsChange([...presets, v])
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
