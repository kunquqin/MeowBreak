import { useState, useEffect } from 'react'
import type { SubReminder } from '../types'
import { WheelColumn, parseTimeHHmm, formatHHmm, WHEEL_VIEW_H } from './TimePickerModal'
import { StaticSplitPreviewSegment, StaticSinglePreviewBar } from './SegmentProgressBars'
import { PresetTextField } from './PresetTextField'
import { WeekdayRepeatControl } from './WeekdayRepeatControl'
import { ALL_WEEKDAYS_ENABLED } from '../utils/weekdayRepeatUtils'
import { RepeatCountPicker } from './RepeatCountPicker'
import { buildSplitSchedule } from '../../../shared/splitSchedule'

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
  title?: string
  time?: string
  /** 闹钟：与 Date.getDay() 一致，长度 7 */
  weekdaysEnabled?: boolean[]
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
  contentPresets: string[]
  titlePresets: string[]
  restPresets: string[]
  onClose: () => void
  onConfirm: (payload: AddSubReminderPayload) => void
  /** 更新主提醒文案预设（闹钟+倒计时共享） */
  onContentPresetsChange: (presets: string[]) => void
  /** 更新子项标题预设（按 mode 分池） */
  onTitlePresetsChange: (presets: string[]) => void
  /** 更新休息弹窗文案预设（与主提醒文案隔离） */
  onRestPresetsChange: (presets: string[]) => void
  /** 编辑已有子项：与新建界面相同，底部为「更新」 */
  variant?: 'create' | 'edit'
  /** variant=edit 时必填，用于载入初始值 */
  sourceItem?: SubReminder
  /** 内联在列表子项/大类内：无遮罩；默认 modal 全屏弹窗 */
  layout?: 'modal' | 'embedded'
  /** 内联时用于重置表单（如每次打开不同草稿） */
  formInstanceKey?: string
}

export function AddSubReminderModal({
  open,
  mode,
  contentPresets,
  titlePresets,
  restPresets,
  onClose,
  onConfirm,
  onContentPresetsChange,
  onTitlePresetsChange,
  onRestPresetsChange,
  variant = 'create',
  sourceItem,
  layout = 'modal',
  formInstanceKey = '',
}: AddSubReminderModalProps) {
  const getDefaultTitle = (m: 'fixed' | 'interval') => (m === 'fixed' ? '未命名闹钟' : '未命名倒计时')
  const [h, setH] = useState(() => getInitialFixedHM(variant, mode, sourceItem).h)
  const [m, setM] = useState(() => getInitialFixedHM(variant, mode, sourceItem).m)
  const [hPreview, setHPreview] = useState(() => getInitialFixedHM(variant, mode, sourceItem).h)
  const [mPreview, setMPreview] = useState(() => getInitialFixedHM(variant, mode, sourceItem).m)

  const [intervalHours, setIntervalHours] = useState(0)
  const [intervalMinutes, setIntervalMinutes] = useState(30)
  const [intervalSeconds, setIntervalSeconds] = useState(0)

  const [title, setTitle] = useState(getDefaultTitle(mode))
  const [content, setContent] = useState('')
  const [splitCount, setSplitCount] = useState(1)
  const [restH, setRestH] = useState(0)
  const [restM, setRestM] = useState(0)
  const [restS, setRestS] = useState(0)
  const [restContent, setRestContent] = useState('休息一下')
  const [splitErr, setSplitErr] = useState<string | null>(null)
  const [weekdaysEnabled, setWeekdaysEnabled] = useState<boolean[]>(() => Array(7).fill(false))
  const [repeatCount, setRepeatCount] = useState<number | null>(1)

  useEffect(() => {
    if (!open) return
    if (variant === 'edit' && sourceItem) {
      if (sourceItem.mode === 'stopwatch') return
      setTitle((sourceItem.title ?? '').trim() || getDefaultTitle(sourceItem.mode))
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
        setWeekdaysEnabled(
          Array.isArray(sourceItem.weekdaysEnabled) && sourceItem.weekdaysEnabled.length === 7
            ? sourceItem.weekdaysEnabled.map(Boolean)
            : [...ALL_WEEKDAYS_ENABLED]
        )
      } else if (sourceItem.mode === 'interval') {
        setIntervalHours(sourceItem.intervalHours ?? 0)
        setIntervalMinutes(sourceItem.intervalMinutes)
        setIntervalSeconds(sourceItem.intervalSeconds ?? 0)
        setRepeatCount(sourceItem.repeatCount ?? null)
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
      setRepeatCount(1)
    }
    setTitle(getDefaultTitle(mode))
    setContent('')
    setWeekdaysEnabled(Array(7).fill(false))
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
  const intervalTotalMs = (intervalHours * 3600 + intervalMinutes * 60 + intervalSeconds) * 1000
  const totalSpanMs =
    mode === 'fixed'
      ? Math.max(0, getNextFixedTimeMs(formatHHmm(hPreview, mPreview)) - Date.now())
      : intervalTotalMs
  const restSec = hmsToSeconds(restH, restM, restS)
  const restMs = splitN > 1 ? restSec * 1000 : 0
  const splitPlan = buildSplitSchedule(totalSpanMs, splitN, restMs)

  useEffect(() => {
    if (!open) return
    if (splitN <= 1) {
      setSplitErr(null)
      return
    }
    if (!splitPlan.valid) {
      setSplitErr('总时长不足以容纳拆分休息，请减少拆分份数或缩短休息时长。')
      return
    }
    if (mode === 'interval' && splitPlan.workDurationsMs.some((d) => d < 1000)) {
      setSplitErr('每段工作时长至少 1 秒，请减少拆分份数或缩短休息时长。')
      return
    }
    setSplitErr(null)
  }, [open, splitN, splitPlan, mode])

  if (!open) return null

  const applyRest = (rh: number, rm: number, rs: number) => {
    const nextRestMs = (splitN > 1 ? hmsToSeconds(rh, rm, rs) : 0) * 1000
    const previewPlan = buildSplitSchedule(totalSpanMs, splitN, nextRestMs)
    if (!previewPlan.valid) {
      setSplitErr('总时长不足以容纳拆分休息，请减少拆分份数或缩短休息时长。')
      return
    }
    if (mode === 'interval' && previewPlan.workDurationsMs.some((d) => d < 1000)) {
      setSplitErr('每段工作时长至少 1 秒，请减少拆分份数或缩短休息时长。')
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

  const useSplit = splitN > 1 && splitPlan.valid && splitPlan.segments.length > 1
  const segments = useSplit ? splitPlan.segments : []

  const handleStart = () => {
    const totalRestSec = splitN > 1 ? hmsToSeconds(restH, restM, restS) : 0
    const confirmPlan = buildSplitSchedule(totalSpanMs, splitN, totalRestSec * 1000)
    if (!confirmPlan.valid) {
      setSplitErr('总时长不足以容纳拆分休息，请减少拆分份数或缩短休息时长。')
      return
    }
    if (mode === 'interval' && confirmPlan.workDurationsMs.some((d) => d < 1000)) {
      setSplitErr('每段工作时长至少 1 秒，请减少拆分份数或缩短休息时长。')
      return
    }
    if (mode === 'fixed') {
      onConfirm({
        mode: 'fixed',
        title: title.trim() || getDefaultTitle('fixed'),
        time: formatHHmm(hPreview, mPreview),
        weekdaysEnabled: weekdaysEnabled.slice(),
        content: content.trim() || '提醒',
        splitCount: splitN,
        restDurationSeconds: splitN > 1 && totalRestSec ? totalRestSec : undefined,
        restContent: splitN > 1 ? restContent.trim() || undefined : undefined,
      })
    } else {
      onConfirm({
        mode: 'interval',
        title: title.trim() || getDefaultTitle('interval'),
        intervalHours,
        intervalMinutes,
        intervalSeconds,
        content: content.trim() || '提醒',
        repeatCount,
        splitCount: splitN,
        restDurationSeconds: splitN > 1 && totalRestSec ? totalRestSec : undefined,
        restContent: splitN > 1 ? restContent.trim() || undefined : undefined,
      })
    }
  }

  const presetResetKey = `${open}-${layout}-${formInstanceKey}-${mode}-${variant}-${sourceItem?.id ?? 'new'}`

  const modalTitle =
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
          <section className="w-full">
            <h4 className={sectionHeadingClass}>标题</h4>
            <div className="w-full">
              <PresetTextField
                key={`title-${presetResetKey}`}
                resetKey={`title-${presetResetKey}`}
                value={title}
                onChange={setTitle}
                presets={titlePresets}
                onPresetsChange={onTitlePresetsChange}
                mainPlaceholder="请输入标题"
                autoFocusInput
              />
            </div>
          </section>

          {/* 2. 闹钟设置 / 倒计时 */}
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

          {/* 3. 提醒内容（含预设） */}
          <section className="w-full">
            <h4 className={sectionHeadingClass}>提醒内容</h4>
            <div className="flex flex-wrap items-center gap-3 w-full">
              <div className="flex-1 min-w-[12rem]">
                <PresetTextField
                  key={`content-${presetResetKey}`}
                  resetKey={presetResetKey}
                  value={content}
                  onChange={setContent}
                  presets={contentPresets}
                  onPresetsChange={onContentPresetsChange}
                  mainPlaceholder="请输入提醒内容"
                  multilineMain
                />
              </div>

              {mode === 'fixed' && (
                <WeekdayRepeatControl
                  weekdaysEnabled={weekdaysEnabled}
                  onChange={setWeekdaysEnabled}
                />
              )}

              {mode === 'interval' && (
                <RepeatCountPicker value={repeatCount} onChange={setRepeatCount} />
              )}
            </div>
          </section>

          {/* 4. 拆分预览（静态条；保存/开始后的列表进度另算） */}
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
                <StaticSinglePreviewBar totalDurationMs={Math.max(0, totalSpanMs)} />
              )}
            </div>
          </section>

          {/* 5. 拆分配置 */}
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
                        presets={restPresets}
                        onPresetsChange={onRestPresetsChange}
                        mainPlaceholder="请输入休息提示语"
                        multilineMain
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
        <div className="shrink-0 border-b border-slate-200 bg-slate-50/95 px-4 py-2.5 text-center text-sm font-medium text-slate-800">{modalTitle}</div>
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
          <h3 className="w-full text-center font-medium text-slate-800 px-10">{modalTitle}</h3>
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
