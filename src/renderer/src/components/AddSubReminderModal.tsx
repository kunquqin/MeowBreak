import { useState, useEffect, useRef, type CSSProperties } from 'react'
import type { PopupTheme, SubReminder } from '../types'
import { WheelColumn, parseTimeHHmm, formatHHmm, WHEEL_VIEW_H } from './TimePickerModal'
import { StaticSplitPreviewSegment, StaticSinglePreviewBar } from './SegmentProgressBars'
import { PresetTextField } from './PresetTextField'
import { WeekdayRepeatControl } from './WeekdayRepeatControl'
import { ALL_WEEKDAYS_ENABLED } from '../utils/weekdayRepeatUtils'
import { RepeatCountPicker } from './RepeatCountPicker'
import { toPreviewImageUrl } from '../utils/popupThemePreview'
import { buildSplitSchedule } from '../../../shared/splitSchedule'

function clampByViewport(minPx: number, viewportRatio: number, maxPx: number, viewportWidth: number): number {
  return Math.max(minPx, Math.min(maxPx, viewportWidth * viewportRatio))
}

function hmsToSeconds(h: number, m: number, s: number): number {
  return Math.max(0, h * 3600 + m * 60 + s)
}

/** 本机当前时分（新建闹钟时默认对齐「此刻」，便于对照系统时间微调） */
function getLocalHoursMinutes(): { h: number; m: number } {
  const d = new Date()
  return { h: d.getHours(), m: d.getMinutes() }
}

function addOneHour(h: number, m: number): { h: number; m: number } {
  const total = (h * 60 + m + 60) % (24 * 60)
  return { h: Math.floor(total / 60), m: total % 60 }
}

function addMinutes(h: number, m: number, minutes: number): { h: number; m: number } {
  const total = (((h * 60 + m + minutes) % (24 * 60)) + (24 * 60)) % (24 * 60)
  return { h: Math.floor(total / 60), m: total % 60 }
}

/** 首次渲染时的时分范围：编辑用条目起止，新建固定闹钟默认「当前到一小时后」 */
function getInitialFixedRangeHM(
  variant: 'create' | 'edit',
  mode: 'fixed' | 'interval',
  sourceItem?: SubReminder
): { startH: number; startM: number; endH: number; endM: number } {
  if (variant === 'edit' && sourceItem?.mode === 'fixed') {
    const end = parseTimeHHmm(sourceItem.time)
    const start = sourceItem.startTime ? parseTimeHHmm(sourceItem.startTime) : end
    return { startH: start.h, startM: start.m, endH: end.h, endM: end.m }
  }
  if (mode === 'fixed') {
    const now = getLocalHoursMinutes()
    const end = addOneHour(now.h, now.m)
    return { startH: now.h, startM: now.m, endH: end.h, endM: end.m }
  }
  return { startH: 12, startM: 0, endH: 12, endM: 0 }
}

function getFixedWindowDurationMs(startH: number, startM: number, endH: number, endM: number): number {
  const startMin = startH * 60 + startM
  const endMin = endH * 60 + endM
  if (startMin === endMin) return 0
  const delta = endMin > startMin ? (endMin - startMin) : (24 * 60 - startMin + endMin)
  return delta * 60 * 1000
}

/** nowMs 到 endH:endM 的精确毫秒差（处理跨天） */
function getMsFromNowToEnd(nowMs: number, endH: number, endM: number): number {
  const d = new Date(nowMs)
  const endToday = new Date(d.getFullYear(), d.getMonth(), d.getDate(), endH, endM, 0, 0).getTime()
  const diff = endToday - nowMs
  if (diff > 0) return diff
  return diff + 24 * 60 * 60 * 1000
}

export type AddSubReminderPayload = {
  mode: 'fixed' | 'interval'
  title?: string
  startTime?: string
  time?: string
  mainPopupThemeId?: string
  restPopupThemeId?: string
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
  useNowAsStart?: boolean
}

export type AddSubReminderModalProps = {
  open: boolean
  mode: 'fixed' | 'interval'
  contentPresets: string[]
  titlePresets: string[]
  restPresets: string[]
  popupThemes: PopupTheme[]
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
  /** 跳转到设置页主题工坊（可选） */
  onOpenThemeStudio?: () => void
}

/** 根据总时长和拆分数计算默认每段休息秒数（总休息 ≈ 总时长的 1/6）。
 *  总时长 ≥ 6 分钟时向上取整到分钟，clamp [60s, 1800s]；
 *  总时长 < 6 分钟时保留秒级精度，clamp [1s, totalSec/splitCount]。 */
function calcDefaultRestSeconds(totalMs: number, splitCount: number): number {
  if (totalMs <= 0 || splitCount <= 1) return 0
  const slots = splitCount - 1
  const perSlotMs = totalMs / 6 / slots
  const totalSec = totalMs / 1000
  if (totalSec >= 360) {
    const perSlotSec = Math.ceil(perSlotMs / 1000 / 60) * 60
    return Math.max(60, Math.min(1800, perSlotSec))
  }
  const perSlotSec = Math.max(1, Math.round(perSlotMs / 1000))
  const maxPerSlot = Math.floor(totalSec / (splitCount + slots)) 
  return Math.max(1, Math.min(perSlotSec, maxPerSlot))
}

export function AddSubReminderModal({
  open,
  mode,
  contentPresets,
  titlePresets,
  restPresets,
  popupThemes,
  onClose,
  onConfirm,
  onContentPresetsChange,
  onTitlePresetsChange,
  onRestPresetsChange,
  variant = 'create',
  sourceItem,
  layout = 'modal',
  formInstanceKey = '',
  onOpenThemeStudio,
}: AddSubReminderModalProps) {
  const getDefaultTitle = (m: 'fixed' | 'interval') => (m === 'fixed' ? '未命名闹钟' : '未命名倒计时')
  const [startH, setStartH] = useState(() => getInitialFixedRangeHM(variant, mode, sourceItem).startH)
  const [startM, setStartM] = useState(() => getInitialFixedRangeHM(variant, mode, sourceItem).startM)
  const [endH, setEndH] = useState(() => getInitialFixedRangeHM(variant, mode, sourceItem).endH)
  const [endM, setEndM] = useState(() => getInitialFixedRangeHM(variant, mode, sourceItem).endM)
  const [startHPreview, setStartHPreview] = useState(() => getInitialFixedRangeHM(variant, mode, sourceItem).startH)
  const [startMPreview, setStartMPreview] = useState(() => getInitialFixedRangeHM(variant, mode, sourceItem).startM)
  const [endHPreview, setEndHPreview] = useState(() => getInitialFixedRangeHM(variant, mode, sourceItem).endH)
  const [endMPreview, setEndMPreview] = useState(() => getInitialFixedRangeHM(variant, mode, sourceItem).endM)
  const [useNowAsStart, setUseNowAsStart] = useState(variant !== 'edit')

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
  const [fixedRangeErr, setFixedRangeErr] = useState<string | null>(null)
  const [mainPopupThemeId, setMainPopupThemeId] = useState('')
  const [restPopupThemeId, setRestPopupThemeId] = useState('')
  const [weekdaysEnabled, setWeekdaysEnabled] = useState<boolean[]>(() => Array(7).fill(false))
  const [repeatCount, setRepeatCount] = useState<number | null>(1)
  const mainThemeOptions = popupThemes.filter((t) => t.target === 'main')
  const restThemeOptions = popupThemes.filter((t) => t.target === 'rest')
  const defaultMainThemeId = mainThemeOptions[0]?.id ?? ''
  const defaultRestThemeId = restThemeOptions[0]?.id ?? ''
  const restManuallySet = useRef(false)
  const restZeroTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [highlightPopupType, setHighlightPopupType] = useState<'rest' | 'main' | null>(null)
  const [previewImageUrlMap, setPreviewImageUrlMap] = useState<Record<string, string>>({})
  const [primaryDisplaySize, setPrimaryDisplaySize] = useState<{ width: number; height: number } | null>(null)
  const [previewContainerWidth, setPreviewContainerWidth] = useState(0)
  const previewMeasureRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    if (variant === 'edit' && sourceItem) {
      if (sourceItem.mode === 'stopwatch') return
      setUseNowAsStart(sourceItem.mode === 'fixed' && sourceItem.useNowAsStart === true)
      setTitle((sourceItem.title ?? '').trim() || getDefaultTitle(sourceItem.mode))
      setContent(sourceItem.content)
      setSplitCount(sourceItem.splitCount ?? 1)
      const rsec = sourceItem.restDurationSeconds ?? 0
      restManuallySet.current = rsec > 0
      const rh = Math.floor(rsec / 3600)
      const rm = Math.floor((rsec % 3600) / 60)
      const rs = rsec % 60
      setRestH(rh)
      setRestM(rm)
      setRestS(rs)
      setRestContent(sourceItem.restContent ?? '休息一下')
      if (sourceItem.mode === 'fixed' || sourceItem.mode === 'interval') {
        setMainPopupThemeId(sourceItem.mainPopupThemeId ?? defaultMainThemeId)
        setRestPopupThemeId(sourceItem.restPopupThemeId ?? defaultRestThemeId)
      }
      if (sourceItem.mode === 'fixed') {
        const { h: eh, m: em } = parseTimeHHmm(sourceItem.time)
        const { h: sh, m: sm } = sourceItem.startTime ? parseTimeHHmm(sourceItem.startTime) : { h: eh, m: em }
        setStartH(sh)
        setStartM(sm)
        setEndH(eh)
        setEndM(em)
        setStartHPreview(sh)
        setStartMPreview(sm)
        setEndHPreview(eh)
        setEndMPreview(em)
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
      setFixedRangeErr(null)
      return
    }
    if (mode === 'fixed') {
      const now = getLocalHoursMinutes()
      const end = addOneHour(now.h, now.m)
      setStartH(now.h)
      setStartM(now.m)
      setEndH(end.h)
      setEndM(end.m)
      setStartHPreview(now.h)
      setStartMPreview(now.m)
      setEndHPreview(end.h)
      setEndMPreview(end.m)
    } else {
      setIntervalHours(0)
      setIntervalMinutes(30)
      setIntervalSeconds(0)
      setRepeatCount(1)
    }
    setUseNowAsStart(true)
    setTitle(getDefaultTitle(mode))
    setContent('')
    setWeekdaysEnabled(Array(7).fill(false))
    setSplitCount(1)
    restManuallySet.current = false
    if (restZeroTimer.current) { clearTimeout(restZeroTimer.current); restZeroTimer.current = null }
    setRestH(0)
    setRestM(0)
    setRestS(0)
    setRestContent('休息一下')
    setMainPopupThemeId(defaultMainThemeId)
    setRestPopupThemeId(defaultRestThemeId)
    setSplitErr(null)
    setFixedRangeErr(null)
  }, [open, mode, variant, sourceItem?.id, formInstanceKey, layout, defaultMainThemeId, defaultRestThemeId])

  useEffect(() => {
    if (!open) return
    if (!mainThemeOptions.some((t) => t.id === mainPopupThemeId)) {
      setMainPopupThemeId(defaultMainThemeId)
    }
    if (!restThemeOptions.some((t) => t.id === restPopupThemeId)) {
      setRestPopupThemeId(defaultRestThemeId)
    }
  }, [open, mainPopupThemeId, restPopupThemeId, mainThemeOptions, restThemeOptions, defaultMainThemeId, defaultRestThemeId])

  useEffect(() => {
    if (!open) return
    window.electronAPI?.getPrimaryDisplaySize?.().then(setPrimaryDisplaySize).catch(() => setPrimaryDisplaySize(null))
  }, [open])

  useEffect(() => {
    const el = previewMeasureRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) setPreviewContainerWidth(entry.contentRect.width)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [open])

  const [nowMs, setNowMs] = useState(Date.now)
  useEffect(() => {
    if (!open) return
    let prevMin = -1
    const tick = () => {
      setNowMs(Date.now())
      if (mode === 'fixed' && useNowAsStart) {
        const now = getLocalHoursMinutes()
        const curMin = now.h * 60 + now.m
        if (curMin !== prevMin) {
          prevMin = curMin
          setStartH(now.h)
          setStartM(now.m)
          setStartHPreview(now.h)
          setStartMPreview(now.m)
        }
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [open, mode, useNowAsStart])

  useEffect(() => {
    if (!open) return
    const api = window.electronAPI
    if (!api?.resolvePreviewImageUrl) return
    const paths = Array.from(
      new Set(
        popupThemes
          .filter((t) => t.backgroundType === 'image')
          .flatMap((t) => {
            const paths: string[] = []
            if ((t.imagePath ?? '').trim()) paths.push((t.imagePath ?? '').trim())
            if (Array.isArray(t.imageFolderFiles)) {
              paths.push(...t.imageFolderFiles.filter((p) => typeof p === 'string' && p.trim().length > 0))
            }
            return paths
          })
      )
    )
    let disposed = false
    void Promise.all(
      paths.map(async (p) => {
        const r = await api.resolvePreviewImageUrl(p)
        return [p, r.success ? r.url : toPreviewImageUrl(p)] as const
      })
    ).then((entries) => {
      if (disposed) return
      setPreviewImageUrlMap(Object.fromEntries(entries))
    })
    return () => { disposed = true }
  }, [open, popupThemes])

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
  const fixedWindowMs = getFixedWindowDurationMs(startHPreview, startMPreview, endHPreview, endMPreview)
  const totalSpanMs =
    mode === 'fixed'
      ? (useNowAsStart ? getMsFromNowToEnd(nowMs, endHPreview, endMPreview) : fixedWindowMs)
      : intervalTotalMs
  const restSec = hmsToSeconds(restH, restM, restS)
  const restMs = splitN > 1 ? restSec * 1000 : 0
  const splitPlan = buildSplitSchedule(totalSpanMs, splitN, restMs)

  const mainPreviewTimeStr = (() => {
    if (mode === 'fixed') return formatHHmm(endHPreview, endMPreview)
    const endDate = new Date(nowMs + intervalTotalMs)
    return formatHHmm(endDate.getHours(), endDate.getMinutes())
  })()

  const restPreviewTimeStr = (() => {
    if (splitN <= 1 || splitPlan.segments.length === 0) return '12:00'
    const firstWorkMs = splitPlan.segments[0]?.durationMs ?? 0
    if (mode === 'fixed') {
      const baseMs = useNowAsStart
        ? nowMs
        : new Date(new Date().setHours(startHPreview, startMPreview, 0, 0)).getTime()
      const t = new Date(baseMs + firstWorkMs)
      return formatHHmm(t.getHours(), t.getMinutes())
    }
    const t = new Date(nowMs + firstWorkMs)
    return formatHHmm(t.getHours(), t.getMinutes())
  })()

  useEffect(() => {
    if (!open) return
    if (mode !== 'fixed') {
      setFixedRangeErr(null)
      return
    }
    const sameMinute = startHPreview === endHPreview && startMPreview === endMPreview
    setFixedRangeErr(sameMinute ? '开始时间与结束时间不能相同。' : null)
  }, [open, mode, startHPreview, startMPreview, endHPreview, endMPreview])

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
    restManuallySet.current = true
    setRestH(rh)
    setRestM(rm)
    setRestS(rs)
    applyRest(rh, rm, rs)
    if (restZeroTimer.current) clearTimeout(restZeroTimer.current)
    if (rh === 0 && rm === 0 && rs === 0) {
      restZeroTimer.current = setTimeout(() => {
        setSplitCount(1)
        restManuallySet.current = false
      }, 400)
    }
  }

  const resetEndToNowPlusOneHour = () => {
    const now = getLocalHoursMinutes()
    let nextEnd = addOneHour(now.h, now.m)
    if (nextEnd.h === startHPreview && nextEnd.m === startMPreview) {
      nextEnd = addMinutes(nextEnd.h, nextEnd.m, 1)
    }
    setEndH(nextEnd.h)
    setEndM(nextEnd.m)
    setEndHPreview(nextEnd.h)
    setEndMPreview(nextEnd.m)
  }

  const useSplit = splitN > 1 && splitPlan.valid && splitPlan.segments.length > 1
  const segments = useSplit ? splitPlan.segments : []

  const handleStart = () => {
    if (mode === 'fixed' && fixedRangeErr) return
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
      const nowSnap = useNowAsStart ? getLocalHoursMinutes() : null
      const startTime = nowSnap ? formatHHmm(nowSnap.h, nowSnap.m) : formatHHmm(startHPreview, startMPreview)
      const endTime = formatHHmm(endHPreview, endMPreview)
      onConfirm({
        mode: 'fixed',
        title: title.trim() || getDefaultTitle('fixed'),
        startTime,
        time: endTime,
        ...(mainPopupThemeId ? { mainPopupThemeId } : {}),
        ...(restPopupThemeId ? { restPopupThemeId } : {}),
        weekdaysEnabled: weekdaysEnabled.slice(),
        content: content.trim() || '提醒',
        splitCount: splitN,
        restDurationSeconds: splitN > 1 && totalRestSec ? totalRestSec : undefined,
        restContent: splitN > 1 ? restContent.trim() || undefined : undefined,
        useNowAsStart,
      })
    } else {
      onConfirm({
        mode: 'interval',
        title: title.trim() || getDefaultTitle('interval'),
        ...(mainPopupThemeId ? { mainPopupThemeId } : {}),
        ...(restPopupThemeId ? { restPopupThemeId } : {}),
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

  const screenW = primaryDisplaySize?.width ?? 1920
  const screenH = primaryDisplaySize?.height ?? 1080
  const previewScale = previewContainerWidth > 0 ? previewContainerWidth / screenW : 0.28
  const toP = (px: number) => Math.max(1, px * previewScale)

  const renderThemePreview = (
    th: PopupTheme | undefined,
    previewText: string,
    isRest: boolean,
    previewTimeStr: string,
    measuredRef?: React.RefObject<HTMLDivElement | null>,
  ) => {
    const contentFontMax = Math.max(14, Math.min(120, Math.floor(th?.contentFontSize ?? 56)))
    const timeFontMax = Math.max(10, Math.min(100, Math.floor(th?.timeFontSize ?? 30)))
    const line1FontPx = clampByViewport(20, 0.06, contentFontMax, screenW)
    const line2FontPx = clampByViewport(14, 0.03, timeFontMax, screenW)
    const rawPath = ((th?.imageSourceType === 'folder' ? th?.imageFolderFiles?.[0] : th?.imagePath) ?? '').trim()
    const imageUrl = previewImageUrlMap[rawPath] || toPreviewImageUrl(rawPath)
    const bg = th?.backgroundType === 'image' && (th?.imagePath || (th?.imageFolderFiles && th.imageFolderFiles.length > 0))
      ? `url("${imageUrl}") center / cover no-repeat, ${th.backgroundColor || '#000'}`
      : (th?.backgroundColor || '#000')
    const defaultTransforms = isRest
      ? { content: { x: 50, y: 30 }, time: { x: 50, y: 48 }, countdown: { x: 50, y: 70 } }
      : { content: { x: 50, y: 42 }, time: { x: 50, y: 55 }, countdown: { x: 50, y: 70 } }
    const ct = th?.contentTransform ?? { x: defaultTransforms.content.x, y: defaultTransforms.content.y, rotation: 0, scale: 1 }
    const tt = th?.timeTransform ?? { x: defaultTransforms.time.x, y: defaultTransforms.time.y, rotation: 0, scale: 1 }

    return (
      <div
        ref={measuredRef as React.RefObject<HTMLDivElement> | undefined}
        className="relative w-full overflow-hidden rounded border border-slate-200 bg-black"
        style={{ aspectRatio: `${screenW} / ${screenH}` }}
      >
        <div className="absolute inset-0" style={{ background: bg }} />
        <div
          className="absolute inset-0"
          style={{
            background: th?.overlayColor || '#000',
            opacity: th?.overlayEnabled ? (th?.overlayOpacity ?? 0.45) : 0,
          }}
        />
        <div className="relative z-[1] h-full w-full">
          <div style={{
            position: 'absolute',
            left: `${ct.x}%`,
            top: `${ct.y}%`,
            transform: `translate(-50%, -50%) rotate(${ct.rotation}deg) scale(${ct.scale})`,
            transformOrigin: 'center',
            color: th?.contentColor || '#fff',
            fontSize: `${toP(line1FontPx)}px`,
            lineHeight: 1.35,
            fontWeight: th?.contentFontWeight ?? 600,
            maxWidth: '96%',
            whiteSpace: 'pre-wrap' as const,
            textAlign: (th?.textAlign ?? 'center') as CSSProperties['textAlign'],
            fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
          }}>
            {previewText}
          </div>
          <div style={{
            position: 'absolute',
            left: `${tt.x}%`,
            top: `${tt.y}%`,
            transform: `translate(-50%, -50%) rotate(${tt.rotation}deg) scale(${tt.scale})`,
            transformOrigin: 'center',
            color: th?.timeColor || '#e2e8f0',
            fontSize: `${toP(line2FontPx)}px`,
            fontWeight: th?.timeFontWeight ?? 400,
            textAlign: (th?.textAlign ?? 'center') as CSSProperties['textAlign'],
            fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
          }}>
            {previewTimeStr}
          </div>
          {isRest && (() => {
            const countdownFontMax = Math.max(48, Math.min(280, Math.floor(th?.countdownFontSize ?? 180)))
            const countdownFontPx = clampByViewport(80, 0.2, countdownFontMax, screenW)
            const cdt = th?.countdownTransform ?? { x: defaultTransforms.countdown.x, y: defaultTransforms.countdown.y, rotation: 0, scale: 1 }
            return (
              <div style={{
                position: 'absolute',
                left: `${cdt.x}%`,
                top: `${cdt.y}%`,
                transform: `translate(-50%, -50%) rotate(${cdt.rotation}deg) scale(${cdt.scale})`,
                transformOrigin: 'center',
                color: th?.timeColor || '#e2e8f0',
                fontSize: `${toP(countdownFontPx)}px`,
                lineHeight: 1,
                fontWeight: th?.countdownFontWeight ?? 700,
              }}>
                5
              </div>
            )
          })()}
        </div>
      </div>
    )
  }

  const formScroll = (
        <div className="flex flex-col gap-10 overflow-visible mx-auto w-full items-center px-4 py-6 sm:px-6 sm:py-8">
          {/* 1. 标题 */}
          <section className="w-full max-w-xl">
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
          <section className="flex w-full max-w-xl flex-col items-center">
            <h4 className={sectionHeadingClass}>{timeSectionTitle}</h4>
            {mode === 'fixed' ? (
              <div className="flex w-full flex-col items-center gap-4">
                <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">开始时间</span>
                    <div className="rounded-lg border border-slate-200 px-3 py-2">
                      <div className="inline-grid grid-cols-[auto_min-content_auto] items-end justify-items-center gap-x-2 sm:gap-x-3">
                        <span className="row-start-1 col-start-1 -translate-y-1 text-center text-xs font-medium text-slate-500">时</span>
                        <span className="row-start-1 col-start-3 -translate-y-1 text-center text-xs font-medium text-slate-500">分</span>
                        <div className="row-start-2 col-start-1 justify-self-center">
                          <WheelColumn label="" min={0} max={23} value={startH} onChange={(v) => { setUseNowAsStart(false); setStartH(v) }} onLiveChange={setStartHPreview} />
                        </div>
                        <div
                          className="row-start-2 col-start-2 flex items-center justify-center select-none text-2xl font-semibold text-slate-900"
                          style={{ height: WHEEL_VIEW_H }}
                          aria-hidden
                        >
                          :
                        </div>
                        <div className="row-start-2 col-start-3 justify-self-center">
                          <WheelColumn label="" min={0} max={59} value={startM} onChange={(v) => { setUseNowAsStart(false); setStartM(v) }} onLiveChange={setStartMPreview} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="text-xs text-slate-500">当前时间</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={useNowAsStart}
                        onClick={() => {
                          const next = !useNowAsStart
                          setUseNowAsStart(next)
                          if (next) {
                            const now = getLocalHoursMinutes()
                            setStartH(now.h)
                            setStartM(now.m)
                            setStartHPreview(now.h)
                            setStartMPreview(now.m)
                          }
                        }}
                        className={`relative h-[20px] w-[36px] shrink-0 rounded-full transition-colors duration-200 ${useNowAsStart ? 'bg-green-500' : 'bg-slate-300'}`}
                      >
                        <span className={`absolute top-[2px] left-[2px] h-[16px] w-[16px] rounded-full bg-white shadow transition-transform duration-200 ${useNowAsStart ? 'translate-x-[16px]' : ''}`} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">结束时间</span>
                    <div className="rounded-lg border border-slate-200 px-3 py-2">
                      <div className="inline-grid grid-cols-[auto_min-content_auto] items-end justify-items-center gap-x-2 sm:gap-x-3">
                        <span className="row-start-1 col-start-1 -translate-y-1 text-center text-xs font-medium text-slate-500">时</span>
                        <span className="row-start-1 col-start-3 -translate-y-1 text-center text-xs font-medium text-slate-500">分</span>
                        <div className="row-start-2 col-start-1 justify-self-center">
                          <WheelColumn label="" min={0} max={23} value={endH} onChange={setEndH} onLiveChange={setEndHPreview} />
                        </div>
                        <div
                          className="row-start-2 col-start-2 flex items-center justify-center select-none text-2xl font-semibold text-slate-900"
                          style={{ height: WHEEL_VIEW_H }}
                          aria-hidden
                        >
                          :
                        </div>
                        <div className="row-start-2 col-start-3 justify-self-center">
                          <WheelColumn label="" min={0} max={59} value={endM} onChange={setEndM} onLiveChange={setEndMPreview} />
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={resetEndToNowPlusOneHour}
                      className="mt-1 inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      title="复位到当前时间后 1 小时"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 .49-9" />
                      </svg>
                      复位
                    </button>
                  </div>
                </div>
                {fixedRangeErr ? (
                  <p className="w-full text-center text-xs text-red-600">{fixedRangeErr}</p>
                ) : (
                  <p className="w-full text-center text-xs text-slate-400">
                    {startHPreview * 60 + startMPreview > endHPreview * 60 + endMPreview ? '该时间范围将跨天（次日结束）。' : '同日时间范围。'}
                  </p>
                )}
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
                <div className="ml-2">
                  <RepeatCountPicker value={repeatCount} onChange={setRepeatCount} />
                </div>
              </div>
            )}
            {mode === 'fixed' ? (
              <>
                <p className="mt-4 w-full text-center text-xs text-slate-400">滚轮、拖拽或点击选择闹钟开始与结束时间。</p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <span className="text-sm font-medium text-slate-600">重复</span>
                  <WeekdayRepeatControl
                    weekdaysEnabled={weekdaysEnabled}
                    onChange={setWeekdaysEnabled}
                  />
                </div>
              </>
            ) : (
              <p className="mt-4 w-full text-center text-xs text-slate-400">请填写倒计时的时、分、秒（到点再次触发）。</p>
            )}
          </section>

          {/* 3. 时间线 */}
          <section className="w-full">
            <h4 className={sectionHeadingClass}>时间线</h4>
            <div className="relative w-full">
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
              {highlightPopupType && totalSpanMs > 0 && (() => {
                const markers: { pct: number; variant: 'green' | 'blue' }[] = []
                if (useSplit && segments.length > 1) {
                  let accMs = 0
                  for (let i = 0; i < segments.length; i++) {
                    if (highlightPopupType === 'rest' && segments[i].type === 'rest') {
                      markers.push({ pct: accMs / totalSpanMs * 100, variant: 'blue' })
                    }
                    accMs += segments[i].durationMs
                  }
                  if (highlightPopupType === 'main') {
                    markers.push({ pct: 100, variant: 'green' })
                  }
                } else if (highlightPopupType === 'main') {
                  markers.push({ pct: 100, variant: 'green' })
                }
                return markers.map((m, i) => (
                  <div
                    key={i}
                    className="pointer-events-none absolute bottom-full mb-0.5 flex flex-col items-center transition-opacity duration-150"
                    style={{ left: `${m.pct}%`, transform: 'translateX(-50%)' }}
                  >
                    <div
                      className={`rounded ${m.variant === 'blue' ? 'bg-blue-500' : 'bg-green-500'}`}
                      style={{ width: '22px', height: '12px' }}
                    />
                    <div
                      className={`h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent ${m.variant === 'blue' ? 'border-t-blue-500' : 'border-t-green-500'}`}
                      style={{ marginTop: '-0.5px' }}
                      aria-hidden
                    />
                  </div>
                ))
              })()}
            </div>
          </section>

          {/* 4. 拆分时间 + 休息时长（左右并排） */}
          <section className="w-full max-w-xl">
            <div className="flex w-full items-start justify-center gap-8 flex-wrap">
              <div className="flex flex-col items-center gap-2">
                <span className="text-sm font-medium text-slate-600">拆分时间</span>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-sm text-slate-600">拆分</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={splitCount}
                    onChange={(e) => {
                      const next = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1))
                      setSplitCount(next)
                      if (next >= 2 && !restManuallySet.current) {
                        const sec = calcDefaultRestSeconds(totalSpanMs, next)
                        if (sec > 0) {
                          const rh = Math.floor(sec / 3600)
                          const rm = Math.floor((sec % 3600) / 60)
                          const rs = sec % 60
                          setRestH(rh)
                          setRestM(rm)
                          setRestS(rs)
                        }
                      }
                    }}
                    className="w-16 rounded border border-slate-300 px-2 py-1 text-center text-sm"
                  />
                  <span className="shrink-0 text-sm text-slate-600">份</span>
                </div>
              </div>
              {splitN > 1 && (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-sm font-medium text-slate-600">休息时长</span>
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={restH}
                      onChange={(e) => handleRestChange(Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0)), restM, restS)}
                      className="w-14 rounded border border-slate-300 px-2 py-1 text-center text-sm"
                    />
                    <span className="text-sm text-slate-500">时</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={restM}
                      onChange={(e) => handleRestChange(restH, Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)), restS)}
                      className="w-14 rounded border border-slate-300 px-2 py-1 text-center text-sm"
                    />
                    <span className="text-sm text-slate-500">分</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={restS}
                      onChange={(e) => handleRestChange(restH, restM, Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                      className="w-14 rounded border border-slate-300 px-2 py-1 text-center text-sm"
                    />
                    <span className="text-sm text-slate-500">秒</span>
                  </div>
                </div>
              )}
            </div>
            {splitErr && <p className="w-full text-center text-xs text-red-600 mt-3">{splitErr}</p>}
          </section>

          {/* 5. 弹窗编辑 — 左右并排（splitN > 1 时休息弹窗在左、结束弹窗在右） */}
          <section className="w-full">
            <div className="mb-4 flex items-center justify-center gap-3">
              <h4 className="text-sm font-medium text-slate-600">弹窗设置</h4>
              {onOpenThemeStudio && (
                <button
                  type="button"
                  onClick={onOpenThemeStudio}
                  className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-50"
                >
                  主题工坊
                </button>
              )}
            </div>
            <div className={splitN > 1 ? 'grid w-full gap-4 grid-cols-1 sm:grid-cols-2' : 'flex w-full justify-center'}>
              {/* 休息弹窗卡片（左列，仅 splitN > 1） */}
              {splitN > 1 && (
                <div
                  className="min-w-0 overflow-hidden rounded-lg border border-slate-200"
                  onMouseEnter={() => setHighlightPopupType('rest')}
                  onMouseLeave={() => setHighlightPopupType(null)}
                  onFocusCapture={() => setHighlightPopupType('rest')}
                  onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHighlightPopupType(null) }}
                >
                  <div className="bg-blue-500 px-3 py-1.5 text-center text-sm font-medium text-white">休息弹窗</div>
                  <div className="border-t border-blue-400" />
                  <div className="space-y-3 p-3">
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 pt-1.5 text-sm text-slate-500">内容</span>
                      <div className="flex-1 min-w-0">
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-slate-500 shrink-0">主题</span>
                      <select
                        value={restPopupThemeId}
                        onChange={(e) => setRestPopupThemeId(e.target.value)}
                        className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                      >
                        {restThemeOptions.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                    {renderThemePreview(
                      restThemeOptions.find((t) => t.id === restPopupThemeId),
                      restContent.trim() || '休息一下',
                      true,
                      restPreviewTimeStr,
                    )}
                  </div>
                </div>
              )}
              {/* 结束弹窗卡片（右列，或 splitN ≤ 1 时居中半宽） */}
              <div
                className={`min-w-0 overflow-hidden rounded-lg border border-slate-200 ${splitN > 1 ? '' : 'w-full sm:w-1/2'}`}
                onMouseEnter={() => setHighlightPopupType('main')}
                onMouseLeave={() => setHighlightPopupType(null)}
                onFocusCapture={() => setHighlightPopupType('main')}
                onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHighlightPopupType(null) }}
              >
                <div className="bg-green-500 px-3 py-1.5 text-center text-sm font-medium text-white">结束弹窗</div>
                <div className="border-t border-green-400" />
                <div className="space-y-3 p-3">
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 pt-1.5 text-sm text-slate-500">内容</span>
                    <div className="flex-1 min-w-0">
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
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-500 shrink-0">主题</span>
                    <select
                      value={mainPopupThemeId}
                      onChange={(e) => setMainPopupThemeId(e.target.value)}
                      className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      {mainThemeOptions.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  {renderThemePreview(
                    mainThemeOptions.find((t) => t.id === mainPopupThemeId),
                    content.trim() || '提醒内容预览',
                    false,
                    mainPreviewTimeStr,
                    previewMeasureRef,
                  )}
                </div>
              </div>
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
              disabled={mode === 'fixed' && !!fixedRangeErr}
              className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm font-medium hover:bg-slate-700 min-w-[88px] disabled:cursor-not-allowed disabled:opacity-50"
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
