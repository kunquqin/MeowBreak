import { useState, useEffect, useRef } from 'react'
import type { ReminderCategory, SubReminder } from '../types'
import { WheelColumn, parseTimeHHmm, formatHHmm, WHEEL_VIEW_H } from './TimePickerModal'
import { StaticSplitPreviewSegment, StaticSinglePreviewBar } from './SegmentProgressBars'

/** 给定 HH:mm，返回下一次该时刻的时间戳（毫秒） */
function getNextFixedTimeMs(timeStr: string): number {
  const { h, m } = parseTimeHHmm(timeStr)
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next.getTime()
}

function hmsToSeconds(h: number, m: number, s: number): number {
  return Math.max(0, h * 3600 + m * 60 + s)
}

/** 本机当前时分（新建闹钟时默认对齐「此刻」，便于对照系统时间微调） */
function getLocalHoursMinutes(): { h: number; m: number } {
  const d = new Date()
  return { h: d.getHours(), m: d.getMinutes() }
}

/** 首次渲染时的时分：编辑用条目时间，新建固定闹钟用本机此刻，其它回退 12:00 */
function getInitialFixedHM(
  variant: 'create' | 'edit',
  mode: 'fixed' | 'interval',
  sourceItem?: SubReminder
): { h: number; m: number } {
  if (variant === 'edit' && sourceItem?.mode === 'fixed') {
    return parseTimeHHmm(sourceItem.time)
  }
  if (mode === 'fixed') return getLocalHoursMinutes()
  return { h: 12, m: 0 }
}

export type AddSubReminderPayload = {
  mode: 'fixed' | 'interval'
  time?: string
  intervalHours?: number
  intervalMinutes?: number
  intervalSeconds?: number
  content: string
  repeatCount?: number | null
  splitCount?: number
  restDurationSeconds?: number
  restContent?: string
}

export type AddSubReminderModalProps = {
  open: boolean
  mode: 'fixed' | 'interval'
  category: ReminderCategory
  categoryIndex: number
  onClose: () => void
  onConfirm: (payload: AddSubReminderPayload) => void
  /** 更新当前大类的预设列表（与设置页其它预设编辑一致，写入本地状态） */
  onPresetsChange: (presets: string[]) => void
  /** 编辑已有子项：与新建界面相同，底部为「更新」 */
  variant?: 'create' | 'edit'
  /** variant=edit 时必填，用于载入初始值 */
  sourceItem?: SubReminder
  /** 内联在列表子项/大类内：无遮罩；默认 modal 全屏弹窗 */
  layout?: 'modal' | 'embedded'
  /** 内联时用于重置表单（如每次打开不同草稿） */
  formInstanceKey?: string
}

/** 与保存/编辑同高，同一行对齐 */
const CTRL_H = 'h-6'
const presetRowInputClass = `${CTRL_H} w-full min-w-0 rounded border border-slate-300 bg-white px-2 text-sm leading-6 box-border outline-none ring-0 focus:outline-none focus:ring-0 focus:border-slate-400`
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
      className={`${CTRL_H} w-6 shrink-0 inline-flex items-center justify-center rounded-full bg-red-500 text-xs font-bold leading-none text-white hover:bg-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-0`}
      title={title ?? '删除'}
      aria-label={title ?? '删除'}
    >
      −
    </button>
  )
}

const PRESET_DRAFT_PLACEHOLDER = '请输入提醒内容'

type PresetTextFieldProps = {
  value: string
  onChange: (v: string) => void
  presets: string[]
  onPresetsChange: (presets: string[]) => void
  /** 主输入框占位 */
  mainPlaceholder: string
  resetKey: string
}

/** 提醒内容 / 休息弹窗文案：主输入 + 同宽预设下拉 */
function PresetTextField({
  value,
  onChange,
  presets,
  onPresetsChange,
  mainPlaceholder,
  resetKey,
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
        className={`${CTRL_H} w-full rounded border border-slate-300 pl-2 pr-8 text-sm leading-6 box-border outline-none ring-0 placeholder:text-slate-300 focus:outline-none focus:ring-0 focus:border-slate-400`}
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
                    className={`${CTRL_H} min-w-0 flex-1 truncate text-left text-sm leading-6 text-slate-800`}
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
              className="flex h-8 w-full items-center justify-center rounded-md border border-dashed border-slate-300 text-base font-medium leading-none text-slate-600 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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

export function AddSubReminderModal({
  open,
  mode,
  category,
  onClose,
  onConfirm,
  onPresetsChange,
  variant = 'create',
  sourceItem,
  layout = 'modal',
  formInstanceKey = '',
}: AddSubReminderModalProps) {
  const [h, setH] = useState(() => getInitialFixedHM(variant, mode, sourceItem).h)
  const [m, setM] = useState(() => getInitialFixedHM(variant, mode, sourceItem).m)
  const [hPreview, setHPreview] = useState(() => getInitialFixedHM(variant, mode, sourceItem).h)
  const [mPreview, setMPreview] = useState(() => getInitialFixedHM(variant, mode, sourceItem).m)

  const [intervalHours, setIntervalHours] = useState(0)
  const [intervalMinutes, setIntervalMinutes] = useState(30)
  const [intervalSeconds, setIntervalSeconds] = useState(0)

  const [content, setContent] = useState('')
  const [splitCount, setSplitCount] = useState(1)
  const [restH, setRestH] = useState(0)
  const [restM, setRestM] = useState(0)
  const [restS, setRestS] = useState(0)
  const [restContent, setRestContent] = useState('休息一下')
  const [splitErr, setSplitErr] = useState<string | null>(null)

  const presets = category.presets ?? []

  useEffect(() => {
    if (!open) return
    if (variant === 'edit' && sourceItem) {
      if (sourceItem.mode === 'stopwatch') return
      setContent(sourceItem.content)
      setSplitCount(sourceItem.splitCount ?? 1)
      const rsec = sourceItem.restDurationSeconds ?? 0
      const rh = Math.floor(rsec / 3600)
      const rm = Math.floor((rsec % 3600) / 60)
      const rs = rsec % 60
      setRestH(rh)
      setRestM(rm)
      setRestS(rs)
      setRestContent(sourceItem.restContent ?? '休息一下')
      if (sourceItem.mode === 'fixed') {
        const { h: fh, m: fm } = parseTimeHHmm(sourceItem.time)
        setH(fh)
        setM(fm)
        setHPreview(fh)
        setMPreview(fm)
      } else if (sourceItem.mode === 'interval') {
        setIntervalHours(sourceItem.intervalHours ?? 0)
        setIntervalMinutes(sourceItem.intervalMinutes)
        setIntervalSeconds(sourceItem.intervalSeconds ?? 0)
      }
      setSplitErr(null)
      return
    }
    if (mode === 'fixed') {
      const { h: nh, m: nm } = getLocalHoursMinutes()
      setH(nh)
      setM(nm)
      setHPreview(nh)
      setMPreview(nm)
    } else {
      setIntervalHours(0)
      setIntervalMinutes(30)
      setIntervalSeconds(0)
    }
    setContent('')
    setSplitCount(1)
    setRestH(0)
    setRestM(0)
    setRestS(0)
    setRestContent('休息一下')
    setSplitErr(null)
  }, [open, mode, variant, sourceItem?.id, formInstanceKey, layout])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const splitN = Math.max(1, Math.min(10, splitCount))
  const segmentMaxSeconds =
    mode === 'interval'
      ? Math.floor((intervalHours * 3600 + intervalMinutes * 60 + intervalSeconds) / Math.max(1, splitN))
      : 24 * 3600

  useEffect(() => {
    if (!open) return
    if (splitN <= 1) {
      setSplitErr(null)
      return
    }
    const total = hmsToSeconds(restH, restM, restS)
    if (segmentMaxSeconds > 0 && total > segmentMaxSeconds) {
      setSplitErr(`单次休息不能超过单份时长（${Math.ceil(segmentMaxSeconds / 60)} 分钟）`)
    } else {
      setSplitErr(null)
    }
  }, [open, segmentMaxSeconds, restH, restM, restS, splitN])

  if (!open) return null

  const restSec = hmsToSeconds(restH, restM, restS)

  const applyRest = (rh: number, rm: number, rs: number) => {
    const total = hmsToSeconds(rh, rm, rs)
    if (splitN > 1 && segmentMaxSeconds > 0 && total > segmentMaxSeconds) {
      setSplitErr(`单次休息不能超过单份时长（${Math.ceil(segmentMaxSeconds / 60)} 分钟）`)
      return
    }
    setSplitErr(null)
  }

  const handleRestChange = (rh: number, rm: number, rs: number) => {
    setRestH(rh)
    setRestM(rm)
    setRestS(rs)
    applyRest(rh, rm, rs)
  }

  const totalWorkMs =
    mode === 'fixed'
      ? Math.max(0, getNextFixedTimeMs(formatHHmm(hPreview, mPreview)) - Date.now())
      : (intervalHours * 3600 + intervalMinutes * 60 + intervalSeconds) * 1000
  const restMs = restSec * 1000
  const segmentDurationMs = splitN > 1 && totalWorkMs > 0 ? Math.floor(totalWorkMs / splitN) : totalWorkMs
  const cycleTotalMs =
    splitN > 1 && totalWorkMs > 0 ? segmentDurationMs * splitN + restMs * (splitN - 1) : totalWorkMs
  const useSplit = splitN > 1 && cycleTotalMs > 0

  const segments: { type: 'work' | 'rest'; durationMs: number }[] = []
  if (useSplit) {
    for (let i = 0; i < splitN; i++) {
      segments.push({ type: 'work', durationMs: segmentDurationMs })
      if (i < splitN - 1 && restMs > 0) segments.push({ type: 'rest', durationMs: restMs })
    }
  }

  const handleStart = () => {
    const totalRestSec = splitN > 1 ? hmsToSeconds(restH, restM, restS) : 0
    if (splitN > 1 && segmentMaxSeconds > 0 && totalRestSec > segmentMaxSeconds) {
      setSplitErr(`单次休息不能超过单份时长（${Math.ceil(segmentMaxSeconds / 60)} 分钟）`)
      return
    }
    if (mode === 'fixed') {
      onConfirm({
        mode: 'fixed',
        time: formatHHmm(hPreview, mPreview),
        content: content.trim() || '提醒',
        splitCount: splitN,
        restDurationSeconds: splitN > 1 && totalRestSec ? totalRestSec : undefined,
        restContent: splitN > 1 ? restContent.trim() || undefined : undefined,
      })
    } else {
      onConfirm({
        mode: 'interval',
        intervalHours,
        intervalMinutes,
        intervalSeconds,
        content: content.trim() || '提醒',
        repeatCount:
          variant === 'edit' && sourceItem?.mode === 'interval' ? (sourceItem.repeatCount ?? null) : null,
        splitCount: splitN,
        restDurationSeconds: splitN > 1 && totalRestSec ? totalRestSec : undefined,
        restContent: splitN > 1 ? restContent.trim() || undefined : undefined,
      })
    }
  }

  const presetResetKey = `${open}-${layout}-${formInstanceKey}-${mode}-${variant}-${sourceItem?.id ?? 'new'}`

  const title =
    mode === 'fixed'
      ? variant === 'edit'
        ? '编辑闹钟提醒'
        : '新建闹钟提醒'
      : variant === 'edit'
        ? '编辑倒计时提醒'
        : '新建倒计时提醒'

  const timeSectionTitle = mode === 'fixed' ? '闹钟设置' : '倒计时'
  const sectionHeadingClass = 'text-sm font-medium text-slate-600 mb-4 w-full text-center'
  const formBodyClass = 'flex flex-col gap-12 overflow-visible mx-auto w-full max-w-xl items-center px-4 py-6 sm:px-6 sm:py-8'

  const formScroll = (
        <div className={formBodyClass}>
          {/* 1. 闹钟设置 / 倒计时 */}
          <section className="flex w-full flex-col items-center">
            <h4 className={sectionHeadingClass}>{timeSectionTitle}</h4>
            {mode === 'fixed' ? (
              <div className="inline-grid grid-cols-[auto_min-content_auto] gap-x-2 sm:gap-x-3 items-end justify-items-center">
                <span className="text-xs text-slate-500 font-medium text-center row-start-1 col-start-1 -translate-y-1">时</span>
                <span className="row-start-1 col-start-3 text-xs text-slate-500 font-medium text-center -translate-y-1">分</span>
                <div className="row-start-2 col-start-1 justify-self-center">
                  <WheelColumn label="" min={0} max={23} value={h} onChange={setH} onLiveChange={setHPreview} />
                </div>
                <div
                  className="row-start-2 col-start-2 flex items-center justify-center text-2xl font-semibold text-slate-900 select-none"
                  style={{ height: WHEEL_VIEW_H }}
                  aria-hidden
                >
                  :
                </div>
                <div className="row-start-2 col-start-3 justify-self-center">
                  <WheelColumn label="" min={0} max={59} value={m} onChange={setM} onLiveChange={setMPreview} />
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 justify-center w-full">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={intervalHours}
                  onChange={(e) => setIntervalHours(Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0)))}
                  className="w-12 rounded border border-slate-300 px-1.5 py-1.5 text-sm text-right"
                />
                <span className="text-slate-500 text-sm">时</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                  className="w-12 rounded border border-slate-300 px-1.5 py-1.5 text-sm text-right"
                />
                <span className="text-slate-500 text-sm">分</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={intervalSeconds}
                  onChange={(e) => setIntervalSeconds(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                  className="w-12 rounded border border-slate-300 px-1.5 py-1.5 text-sm text-right"
                />
                <span className="text-slate-500 text-sm">秒</span>
              </div>
            )}
            {mode === 'fixed' ? (
              <p className="mt-4 w-full text-center text-xs text-slate-400">滚轮、拖拽或点击选择闹钟响铃时间。</p>
            ) : (
              <p className="mt-4 w-full text-center text-xs text-slate-400">请填写倒计时的时、分、秒（到点再次触发）。</p>
            )}
          </section>

          {/* 2. 提醒内容（含预设） */}
          <section className="w-full">
            <h4 className={sectionHeadingClass}>提醒内容</h4>
            <PresetTextField
              key={`content-${presetResetKey}`}
              resetKey={presetResetKey}
              value={content}
              onChange={setContent}
              presets={presets}
              onPresetsChange={onPresetsChange}
              mainPlaceholder="请输入提醒内容"
            />
          </section>

          {/* 3. 拆分预览（静态条；保存/开始后的列表进度另算） */}
          <section className="w-full">
            <h4 className={sectionHeadingClass}>拆分预览</h4>
            <div className="w-full flex items-center gap-1.5 flex-wrap min-h-[1rem]">
              {useSplit && segments.length > 0 ? (
                segments.map((seg, i) => (
                  <StaticSplitPreviewSegment
                    key={i}
                    durationMs={seg.durationMs}
                    fillClass={seg.type === 'work' ? 'bg-green-500' : 'bg-blue-500'}
                  />
                ))
              ) : (
                <StaticSinglePreviewBar totalDurationMs={Math.max(0, totalWorkMs)} />
              )}
            </div>
          </section>

          {/* 4. 拆分配置 */}
          <section className="w-full">
            <h4 className={sectionHeadingClass}>拆分配置</h4>
            <div className="flex w-full flex-col items-center space-y-5">
              <div className="flex items-center justify-center gap-2">
                <span className="shrink-0 text-sm text-slate-600">拆分</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={splitCount}
                  onChange={(e) => setSplitCount(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))}
                  className="w-14 rounded border border-slate-300 px-1.5 py-1 text-right text-sm"
                />
                <span className="shrink-0 text-sm text-slate-600">份</span>
              </div>
              {splitN > 1 && (
                <>
                  <div className="flex w-full flex-col items-center gap-2">
                    <span className="text-center text-sm text-slate-600">休息时长</span>
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={restH}
                        onChange={(e) => handleRestChange(Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0)), restM, restS)}
                        className="w-10 rounded border border-slate-300 px-1 py-1 text-right text-sm"
                      />
                      <span className="text-sm text-slate-500">时</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={restM}
                        onChange={(e) => handleRestChange(restH, Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)), restS)}
                        className="w-10 rounded border border-slate-300 px-1 py-1 text-right text-sm"
                      />
                      <span className="text-sm text-slate-500">分</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={restS}
                        onChange={(e) => handleRestChange(restH, restM, Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                        className="w-10 rounded border border-slate-300 px-1 py-1 text-right text-sm"
                      />
                      <span className="text-sm text-slate-500">秒</span>
                    </div>
                  </div>
                  <div className="flex w-full flex-col items-center gap-2">
                    <span className="text-center text-sm text-slate-600">休息弹窗文案</span>
                    <div className="w-full">
                      <PresetTextField
                        key={`rest-${presetResetKey}`}
                        resetKey={presetResetKey}
                        value={restContent}
                        onChange={setRestContent}
                        presets={presets}
                        onPresetsChange={onPresetsChange}
                        mainPlaceholder="请输入休息提示语"
                      />
                    </div>
                  </div>
                </>
              )}
              {splitErr && <p className="text-center text-xs text-red-600">{splitErr}</p>}
            </div>
          </section>
        </div>
  )

  const formFooter = (
        <div className="flex w-full shrink-0 flex-col items-center gap-4 border-t border-slate-200 bg-slate-50 px-4 py-4">
          <p className="text-xs text-slate-400 text-center w-full">
            {variant === 'edit' ? '点击更新后立即生效。' : '点击开始后立即生效。'}
          </p>
          <div className="flex justify-center gap-3 w-full">
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 min-w-[88px]"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm font-medium hover:bg-slate-700 min-w-[88px]"
              onClick={handleStart}
            >
              {variant === 'edit' ? '更新' : '开始'}
            </button>
          </div>
        </div>
  )

  if (layout === 'embedded') {
    return (
      <div className="flex w-full flex-col overflow-visible rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="shrink-0 border-b border-slate-200 bg-slate-50/95 px-4 py-2.5 text-center text-sm font-medium text-slate-800">{title}</div>
        <div className="flex flex-col overflow-visible">
          {formScroll}
          {formFooter}
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[200000] flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-8"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-5xl flex-col overflow-visible rounded-xl bg-white shadow-xl"
        style={{ maxWidth: 'min(1024px, 100vw - 2rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex min-h-[48px] items-center justify-center border-b border-slate-200 px-4 py-3">
          <h3 className="w-full text-center font-medium text-slate-800 px-10">{title}</h3>
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-xl leading-none text-slate-400 hover:text-slate-600"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        {formScroll}
        {formFooter}
      </div>
    </div>
  )
}
