import React, { useRef, useCallback, useMemo, useLayoutEffect, useState, useEffect } from 'react'
import { flushSync } from 'react-dom'
import Moveable from 'react-moveable'
import type { PopupTheme, TextTransform } from '../types'
import { toPreviewImageUrl } from '../utils/popupThemePreview'

export type TextElementKey = 'content' | 'time' | 'countdown'

interface ThemePreviewEditorProps {
  theme: PopupTheme
  onUpdateTheme: (themeId: string, patch: Partial<PopupTheme>) => void
  previewViewportWidth: number
  previewImageUrlMap: Record<string, string>
  popupPreviewAspect: '16:9' | '4:3'
  selectedElements: TextElementKey[]
  onSelectElements: (keys: TextElementKey[]) => void
}

function clampByViewport(minPx: number, viewportRatio: number, maxPx: number, viewportWidth: number): number {
  return Math.max(minPx, Math.min(maxPx, viewportWidth * viewportRatio))
}

/** Moveable 打组轨道平移多为 translate(xpx,ypx)，偶发 translate3d */
function parseTransformValues(css: string): { translateX: number; translateY: number; rotation: number; scale: number } {
  let tx = 0, ty = 0
  const t2 = /translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)/.exec(css)
  if (t2) { tx = parseFloat(t2[1]); ty = parseFloat(t2[2]) }
  else {
    const t3 = /translate3d\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px/.exec(css)
    if (t3) { tx = parseFloat(t3[1]); ty = parseFloat(t3[2]) }
  }
  const r = /rotate\(\s*([-\d.]+)deg\s*\)/.exec(css)
  const s = /scale\(\s*([-\d.]+)/.exec(css)
  return { translateX: tx, translateY: ty, rotation: r ? parseFloat(r[1]) : 0, scale: s ? parseFloat(s[1]) : 1 }
}

function hasPixelTranslate(css: string): boolean {
  return /\btranslate\s*\([^)]*px/.test(css) || /\btranslate3d\s*\([^)]*px/.test(css)
}

function buildTransform(tx: number, ty: number, rotation: number, scale: number): string {
  return `translate(${tx}px, ${ty}px) rotate(${rotation}deg) scale(${scale})`
}

/**
 * 打组旋转/缩放：子事件里 `transform` 常只有 rotate/scale；
 * 轨道平移多在 `drag.transform`；`afterTransform` 理论上等于 drag 合成，但有时与 `transform` 相同（都缺平移）。
 */
function pickMoveableCssTransform(e: { transform?: string; afterTransform?: string; drag?: { transform?: string; afterTransform?: string } }): string {
  const t = (e.transform ?? '').trim()
  const a = (e.afterTransform ?? '').trim()
  const dt = (e.drag?.transform ?? '').trim()
  const da = (e.drag?.afterTransform ?? '').trim()

  if (a.length > 0 && a !== t && hasPixelTranslate(a)) return a
  if (dt.length > 0 && hasPixelTranslate(dt)) return dt
  if (da.length > 0 && hasPixelTranslate(da)) return da
  if (a.length > 0 && hasPixelTranslate(a)) return a
  if (a.length > 0) return a
  if (da.length > 0) return da
  if (dt.length > 0) return dt
  return t
}

/** Shift 吸附角度：只改第一个 rotate()，保留多段 translate 等 */
function snapRotateInFullTransform(css: string, inputEvent: MouseEvent | TouchEvent | null): string {
  if (!inputEvent || !(inputEvent as MouseEvent).shiftKey) return css
  const m = /rotate\(\s*([-\d.]+)deg\s*\)/.exec(css)
  if (!m || m.index === undefined) return css
  const r = parseFloat(m[1])
  const snapped = Math.round(r / 15) * 15
  return css.slice(0, m.index) + `rotate(${snapped}deg)` + css.slice(m.index + m[0].length)
}

export const DEFAULT_TRANSFORMS: Record<string, Record<TextElementKey, TextTransform>> = {
  main: {
    content: { x: 50, y: 42, rotation: 0, scale: 1 },
    time: { x: 50, y: 55, rotation: 0, scale: 1 },
    countdown: { x: 50, y: 70, rotation: 0, scale: 1 },
  },
  rest: {
    content: { x: 50, y: 30, rotation: 0, scale: 1 },
    time: { x: 50, y: 48, rotation: 0, scale: 1 },
    countdown: { x: 50, y: 70, rotation: 0, scale: 1 },
  },
}

const ALIGN_ICONS = {
  left: (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="2" y1="2" x2="2" y2="14" /><line x1="5" y1="5" x2="14" y2="5" /><line x1="5" y1="11" x2="11" y2="11" /></svg>),
  centerH: (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="8" y1="2" x2="8" y2="14" /><line x1="3" y1="5" x2="13" y2="5" /><line x1="4" y1="11" x2="12" y2="11" /></svg>),
  right: (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="14" y1="2" x2="14" y2="14" /><line x1="2" y1="5" x2="11" y2="5" /><line x1="5" y1="11" x2="11" y2="11" /></svg>),
  top: (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="2" y1="2" x2="14" y2="2" /><line x1="5" y1="5" x2="5" y2="14" /><line x1="11" y1="5" x2="11" y2="11" /></svg>),
  centerV: (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="2" y1="8" x2="14" y2="8" /><line x1="5" y1="3" x2="5" y2="13" /><line x1="11" y1="4" x2="11" y2="12" /></svg>),
  bottom: (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="2" y1="14" x2="14" y2="14" /><line x1="5" y1="2" x2="5" y2="11" /><line x1="11" y1="5" x2="11" y2="11" /></svg>),
}

const GROUP_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1" width="5" height="5" rx="0.5" /><rect x="8" y="8" width="5" height="5" rx="0.5" />
    <path d="M6 3.5h2M8 3.5v5M8 8.5h-2M6 8.5v-5" strokeDasharray="1.5 1" />
  </svg>
)
const UNGROUP_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1" width="5" height="5" rx="0.5" /><rect x="8" y="8" width="5" height="5" rx="0.5" />
  </svg>
)

interface ElementSnapshot { t: TextTransform; txPx: number; tyPx: number }

export function ThemePreviewEditor({
  theme, onUpdateTheme, previewViewportWidth, previewImageUrlMap,
  popupPreviewAspect, selectedElements, onSelectElements,
}: ThemePreviewEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const timeRef = useRef<HTMLDivElement>(null)
  const countdownRef = useRef<HTMLDivElement>(null)
  const moveableRef = useRef<Moveable | null>(null)

  const [groupMode, setGroupMode] = useState(true)
  /** 为 true 时禁止从 theme 同步 transform 到 DOM（避免覆盖 Moveable）；必须用 React style 持有 transform，否则父组件重渲染会清掉 Moveable 写的内联样式 */
  const [transformSyncLocked, setTransformSyncLocked] = useState(false)
  /** 与 theme 对齐的 transform 字符串，必须出现在 JSX style 中，防止 React 提交时抹掉 transform */
  const [styleTransformByKey, setStyleTransformByKey] = useState<Partial<Record<TextElementKey, string>>>({})

  const previewScale = Math.min(1, 920 / Math.max(1, previewViewportWidth))
  const toPreviewPx = (px: number) => Math.max(1, px * previewScale)

  const contentFontMax = Math.max(14, Math.min(120, Math.floor(theme.contentFontSize ?? 56)))
  const timeFontMax = Math.max(10, Math.min(100, Math.floor(theme.timeFontSize ?? 30)))
  const countdownFontMax = Math.max(48, Math.min(280, Math.floor(theme.countdownFontSize ?? 180)))
  const isMain = theme.target === 'main'
  const contentFontPx = clampByViewport(20, 0.06, contentFontMax, previewViewportWidth)
  const timeFontPx = clampByViewport(14, 0.03, timeFontMax, previewViewportWidth)
  const countdownFontPx = clampByViewport(80, 0.2, countdownFontMax, previewViewportWidth)

  const getTransform = useCallback((key: TextElementKey): TextTransform => {
    const t = key === 'content' ? theme.contentTransform : key === 'time' ? theme.timeTransform : theme.countdownTransform
    return t ?? DEFAULT_TRANSFORMS[theme.target]?.[key] ?? { x: 50, y: 50, rotation: 0, scale: 1 }
  }, [theme.contentTransform, theme.timeTransform, theme.countdownTransform, theme.target])

  const updateTransform = useCallback((key: TextElementKey, patch: Partial<TextTransform>) => {
    const current = getTransform(key)
    const field = key === 'content' ? 'contentTransform' : key === 'time' ? 'timeTransform' : 'countdownTransform'
    onUpdateTheme(theme.id, { [field]: { ...current, ...patch } })
  }, [getTransform, onUpdateTheme, theme.id])

  const getTargetRef = useCallback((key: TextElementKey | null) => {
    if (key === 'content') return contentRef
    if (key === 'time') return timeRef
    if (key === 'countdown') return countdownRef
    return null
  }, [])

  const elementGuidelineRefs = useCallback(() => {
    const refs: HTMLDivElement[] = []
    if (contentRef.current && !selectedElements.includes('content')) refs.push(contentRef.current)
    if (timeRef.current && !selectedElements.includes('time')) refs.push(timeRef.current)
    if (countdownRef.current && !selectedElements.includes('countdown')) refs.push(countdownRef.current)
    return refs
  }, [selectedElements])

  const handleElementClick = useCallback((key: TextElementKey, e: React.MouseEvent) => {
    e.stopPropagation()
    if (e.shiftKey) {
      if (selectedElements.includes(key)) onSelectElements(selectedElements.filter(k => k !== key))
      else onSelectElements([...selectedElements, key])
    } else {
      if (selectedElements.length === 1 && selectedElements[0] === key) return
      onSelectElements([key])
    }
  }, [onSelectElements, selectedElements])

  const bgImageKey = ((theme.imageSourceType === 'folder' ? theme.imageFolderFiles?.[0] : theme.imagePath) ?? '').trim()
  const bgImageUrl = previewImageUrlMap[bgImageKey] || toPreviewImageUrl(bgImageKey)
  const hasBgImage = theme.backgroundType === 'image' && (theme.imagePath || (theme.imageFolderFiles && theme.imageFolderFiles.length > 0))

  const textElements: { key: TextElementKey; ref: React.RefObject<HTMLDivElement>; label: string }[] = isMain
    ? [{ key: 'content', ref: contentRef as React.RefObject<HTMLDivElement>, label: '提醒内容' }, { key: 'time', ref: timeRef as React.RefObject<HTMLDivElement>, label: '12:00' }]
    : [{ key: 'content', ref: contentRef as React.RefObject<HTMLDivElement>, label: '休息提醒内容' }, { key: 'time', ref: timeRef as React.RefObject<HTMLDivElement>, label: '12:00' }, { key: 'countdown', ref: countdownRef as React.RefObject<HTMLDivElement>, label: '5' }]

  const multiSelected = selectedElements.length >= 2

  const getFontWeight = useCallback((key: TextElementKey): number => {
    if (key === 'content') return theme.contentFontWeight ?? 600
    if (key === 'time') return theme.timeFontWeight ?? 400
    return theme.countdownFontWeight ?? 700
  }, [theme.contentFontWeight, theme.timeFontWeight, theme.countdownFontWeight])

  const mergeStyleTransforms = useCallback((patch: Partial<Record<TextElementKey, string>>) => {
    setStyleTransformByKey(prev => ({ ...prev, ...patch }))
  }, [])

  /** 预览内拖拽时：每指针事件都写 DOM，但 React state + updateRect 合并到每帧一次，减轻卡顿与布局抖动 */
  const pendingMoveablePatchRef = useRef<Partial<Record<TextElementKey, string>>>({})
  const moveableVisualRafRef = useRef<number | null>(null)

  const resetMoveableVisualPipeline = useCallback(() => {
    if (moveableVisualRafRef.current != null) {
      cancelAnimationFrame(moveableVisualRafRef.current)
      moveableVisualRafRef.current = null
    }
    pendingMoveablePatchRef.current = {}
  }, [])

  const flushMoveableVisual = useCallback((mode: 'sync' | 'raf') => {
    const run = () => {
      moveableVisualRafRef.current = null
      const pending = pendingMoveablePatchRef.current
      if (Object.keys(pending).length > 0) {
        const patch = { ...pending }
        pendingMoveablePatchRef.current = {}
        mergeStyleTransforms(patch)
      }
      moveableRef.current?.updateRect()
    }
    if (mode === 'sync') {
      if (moveableVisualRafRef.current != null) {
        cancelAnimationFrame(moveableVisualRafRef.current)
        moveableVisualRafRef.current = null
      }
      run()
    } else if (moveableVisualRafRef.current == null) {
      moveableVisualRafRef.current = requestAnimationFrame(run)
    }
  }, [mergeStyleTransforms])

  useEffect(() => () => {
    if (moveableVisualRafRef.current != null) cancelAnimationFrame(moveableVisualRafRef.current)
  }, [])

  // 从 theme 计算各文字层的 transform（写入 state，进入 JSX，避免被 React 重渲染抹掉）
  useLayoutEffect(() => {
    if (transformSyncLocked) return
    const container = containerRef.current
    if (!container) return
    const cW = container.offsetWidth
    const cH = container.offsetHeight
    const next: Partial<Record<TextElementKey, string>> = {}
    const pairs: { key: TextElementKey; ref: React.RefObject<HTMLDivElement | null> }[] = isMain
      ? [{ key: 'content', ref: contentRef }, { key: 'time', ref: timeRef }]
      : [{ key: 'content', ref: contentRef }, { key: 'time', ref: timeRef }, { key: 'countdown', ref: countdownRef }]
    for (const { ref, key } of pairs) {
      const el = ref.current
      if (!el) continue
      const t = getTransform(key)
      const tx = cW * (t.x / 100) - el.offsetWidth / 2
      const ty = cH * (t.y / 100) - el.offsetHeight / 2
      next[key] = buildTransform(tx, ty, t.rotation, t.scale)
    }
    setStyleTransformByKey(prev => {
      let same = true
      for (const k of Object.keys(next) as TextElementKey[]) {
        if (prev[k] !== next[k]) { same = false; break }
      }
      if (same && Object.keys(prev).length === Object.keys(next).length) return prev
      return { ...prev, ...next }
    })
  }, [transformSyncLocked, contentFontPx, timeFontPx, countdownFontPx, theme.contentFontWeight, theme.timeFontWeight,
    theme.countdownFontWeight, isMain, theme.textAlign, previewScale,
    theme.contentTransform, theme.timeTransform, theme.countdownTransform, theme.target, getTransform])

  /** 下方参数区改字号/字重/对齐等导致目标尺寸变化时，同步 Moveable 外框（拖拽中由 applyMoveableFrame 内 updateRect） */
  useLayoutEffect(() => {
    if (transformSyncLocked) return
    if (selectedElements.length === 0) return
    moveableRef.current?.updateRect()
  }, [styleTransformByKey, contentFontPx, timeFontPx, countdownFontPx, theme.textAlign,
    theme.contentFontWeight, theme.timeFontWeight, theme.countdownFontWeight,
    selectedElements, transformSyncLocked, previewViewportWidth, popupPreviewAspect])

  /**
   * 与 useLayoutEffect 中正算 `tx = cW*(x/100)-w/2` 严格互逆；松手时勿用 getBoundingClientRect 中心（旋转后 AABB 中心 ≠ 布局中心），
   * 也不要用 toFixed 后的 x/y 反算 tx，否则会出现往右下角的亚像素跳变。
   */
  const translateToThemePercent = useCallback((el: HTMLElement, translateX: number, translateY: number) => {
    const container = containerRef.current
    if (!container) return { x: 50, y: 50 }
    const cW = container.offsetWidth
    const cH = container.offsetHeight
    const w = el.offsetWidth
    const h = el.offsetHeight
    const x = Math.max(0, Math.min(100, ((translateX + w / 2) / cW) * 100))
    const y = Math.max(0, Math.min(100, ((translateY + h / 2) / cH) * 100))
    return { x, y }
  }, [])

  const finalizeElement = useCallback((el: HTMLElement) => {
    const k = (el.dataset.elementKey as TextElementKey) || null
    if (!k || !containerRef.current) return
    const css = el.style.transform || styleTransformByKey[k] || ''
    const { translateX, translateY, rotation, scale } = parseTransformValues(css)
    const pos = translateToThemePercent(el, translateX, translateY)
    updateTransform(k, {
      x: pos.x,
      y: pos.y,
      rotation: +rotation.toFixed(2),
      scale: +scale.toFixed(4),
    })
    const tf = buildTransform(translateX, translateY, rotation, scale)
    el.style.transform = tf
    mergeStyleTransforms({ [k]: tf })
  }, [styleTransformByKey, translateToThemePercent, updateTransform, mergeStyleTransforms])

  const snapshotsRef = useRef(new Map<string, ElementSnapshot>())
  const takeSnapshots = useCallback(() => {
    snapshotsRef.current.clear()
    for (const k of selectedElements) {
      const el = getTargetRef(k)?.current
      if (!el) continue
      const { translateX, translateY } = parseTransformValues(el.style.transform)
      snapshotsRef.current.set(k, { t: { ...getTransform(k) }, txPx: translateX, tyPx: translateY })
    }
  }, [selectedElements, getTransform, getTargetRef])

  const [marqueeRect, setMarqueeRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const justMarqueedRef = useRef(false)

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (justMarqueedRef.current) { justMarqueedRef.current = false; return }
    if (e.target === containerRef.current || (e.target as HTMLElement).dataset?.layer === 'bg') onSelectElements([])
  }, [onSelectElements])

  const handleContainerMouseDown = useCallback((e: React.MouseEvent) => {
    const hit = e.target as HTMLElement
    if (hit !== containerRef.current && hit.dataset?.layer !== 'bg') return
    e.preventDefault()
    const container = containerRef.current!
    const cRect = container.getBoundingClientRect()
    const startX = e.clientX - cRect.left, startY = e.clientY - cRect.top
    let active = false
    const onMove = (ev: MouseEvent) => {
      const curX = Math.max(0, Math.min(cRect.width, ev.clientX - cRect.left))
      const curY = Math.max(0, Math.min(cRect.height, ev.clientY - cRect.top))
      if (!active && (Math.abs(curX - startX) > 3 || Math.abs(curY - startY) > 3)) active = true
      if (active) setMarqueeRect({ left: Math.min(startX, curX), top: Math.min(startY, curY), width: Math.abs(curX - startX), height: Math.abs(curY - startY) })
    }
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (active) {
        justMarqueedRef.current = true
        const endX = Math.max(0, Math.min(cRect.width, ev.clientX - cRect.left))
        const endY = Math.max(0, Math.min(cRect.height, ev.clientY - cRect.top))
        const sL = Math.min(startX, endX), sT = Math.min(startY, endY)
        const sR = Math.max(startX, endX), sB = Math.max(startY, endY)
        const cW = container.offsetWidth, cH = container.offsetHeight
        const hits: TextElementKey[] = []
        for (const { key } of textElements) {
          const t = getTransform(key)
          const cx = (t.x / 100) * cW, cy = (t.y / 100) * cH
          if (cx >= sL && cx <= sR && cy >= sT && cy <= sB) hits.push(key)
        }
        onSelectElements(hits)
      }
      setMarqueeRect(null)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [textElements, getTransform, onSelectElements])

  /** 多选对齐：按各层变换后的轴对齐包围盒（AABB）对齐，与 Figma / 设计工具一致；不用中心点百分比直接比较 */
  const handleAlign = useCallback((mode: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom') => {
    if (selectedElements.length < 2) return
    const container = containerRef.current
    if (!container) return
    const cRect = container.getBoundingClientRect()
    type Box = { key: TextElementKey; el: HTMLElement; left: number; right: number; top: number; bottom: number }
    const boxes: Box[] = []
    for (const k of selectedElements) {
      const el = getTargetRef(k)?.current
      if (!el) continue
      const r = el.getBoundingClientRect()
      boxes.push({
        key: k,
        el,
        left: r.left - cRect.left,
        right: r.right - cRect.left,
        top: r.top - cRect.top,
        bottom: r.bottom - cRect.top,
      })
    }
    if (boxes.length < 2) return

    const minL = Math.min(...boxes.map(b => b.left))
    const maxR = Math.max(...boxes.map(b => b.right))
    const minT = Math.min(...boxes.map(b => b.top))
    const maxB = Math.max(...boxes.map(b => b.bottom))
    const unionCx = (minL + maxR) / 2
    const unionCy = (minT + maxB) / 2

    const fieldOf = (k: TextElementKey) => k === 'content' ? 'contentTransform' : k === 'time' ? 'timeTransform' : 'countdownTransform'
    const cW = container.offsetWidth
    const cH = container.offsetHeight

    const readTranslate = (b: Box) => {
      const css = (b.el.style.transform || styleTransformByKey[b.key] || '').trim()
      if (css) return parseTransformValues(css)
      const t = getTransform(b.key)
      return {
        translateX: cW * (t.x / 100) - b.el.offsetWidth / 2,
        translateY: cH * (t.y / 100) - b.el.offsetHeight / 2,
        rotation: t.rotation,
        scale: t.scale,
      }
    }

    const stylePatch: Partial<Record<TextElementKey, string>> = {}
    for (const b of boxes) {
      const { translateX, translateY, rotation, scale } = readTranslate(b)
      const cx = (b.left + b.right) / 2
      const cy = (b.top + b.bottom) / 2
      let deltaX = 0
      let deltaY = 0
      if (mode === 'left') deltaX = minL - b.left
      else if (mode === 'right') deltaX = maxR - b.right
      else if (mode === 'centerH') deltaX = unionCx - cx
      else if (mode === 'top') deltaY = minT - b.top
      else if (mode === 'bottom') deltaY = maxB - b.bottom
      else if (mode === 'centerV') deltaY = unionCy - cy

      const newTf = buildTransform(translateX + deltaX, translateY + deltaY, rotation, scale)
      b.el.style.transform = newTf
      stylePatch[b.key] = newTf
    }
    mergeStyleTransforms(stylePatch)

    const patch: Partial<PopupTheme> = {}
    for (const b of boxes) {
      const css = (b.el.style.transform || styleTransformByKey[b.key] || '').trim()
      const { translateX, translateY, rotation, scale } = parseTransformValues(css)
      const pos = translateToThemePercent(b.el, translateX, translateY)
      const cur = getTransform(b.key)
      ;(patch as Record<string, TextTransform>)[fieldOf(b.key)] = {
        ...cur,
        x: pos.x,
        y: pos.y,
        rotation: +rotation.toFixed(2),
        scale: +scale.toFixed(4),
      }
    }
    onUpdateTheme(theme.id, patch)
    requestAnimationFrame(() => moveableRef.current?.updateRect())
  }, [selectedElements, getTargetRef, getTransform, onUpdateTheme, theme.id, styleTransformByKey, mergeStyleTransforms, translateToThemePercent])

  const alignButtons = useMemo(() => [
    { mode: 'left' as const, icon: ALIGN_ICONS.left, title: '左对齐' },
    { mode: 'centerH' as const, icon: ALIGN_ICONS.centerH, title: '水平居中' },
    { mode: 'right' as const, icon: ALIGN_ICONS.right, title: '右对齐' },
    { mode: 'top' as const, icon: ALIGN_ICONS.top, title: '顶部对齐' },
    { mode: 'centerV' as const, icon: ALIGN_ICONS.centerV, title: '垂直居中' },
    { mode: 'bottom' as const, icon: ALIGN_ICONS.bottom, title: '底部对齐' },
  ], [])

  const moveableTargets = useMemo(() => {
    return selectedElements.map(k => getTargetRef(k)?.current).filter((e): e is HTMLElement => !!e)
  }, [selectedElements, getTargetRef])

  const moveableKey = useMemo(() => selectedElements.slice().sort().join(','), [selectedElements])

  const moveableTarget = useMemo(
    () => moveableTargets.length === 1 ? moveableTargets[0] : moveableTargets,
    [moveableTargets],
  )

  const keyOfEl = (el: HTMLElement) => (el.dataset.elementKey as TextElementKey) || null

  const applyMoveableFrame = useCallback((events: { target: HTMLElement; transform: string }[]) => {
    for (const ev of events) {
      ev.target.style.transform = ev.transform
      const k = keyOfEl(ev.target)
      if (k) pendingMoveablePatchRef.current[k] = ev.transform
    }
    flushMoveableVisual('raf')
  }, [flushMoveableVisual])

  /** 先选中再立刻拖：flushSync 后 Moveable 可能尚未挂 ref，故带重试 */
  const scheduleDragStart = useCallback((nativeEv: MouseEvent) => {
    const tryStart = (): boolean => {
      const m = moveableRef.current
      if (!m) return false
      try {
        m.dragStart(nativeEv)
        return true
      } catch {
        return false
      }
    }
    if (tryStart()) return
    let n = 0
    const tick = () => {
      n++
      if (tryStart() || n >= 16) return
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [])

  const handleTextPointerDown = useCallback((key: TextElementKey, e: React.MouseEvent) => {
    if (e.button !== 0) return
    if (e.shiftKey) return
    e.stopPropagation()
    const inSel = selectedElements.includes(key)
    const multi = selectedElements.length >= 2
    if (multi && inSel) {
      scheduleDragStart(e.nativeEvent)
      return
    }
    if (!inSel || selectedElements.length !== 1 || selectedElements[0] !== key) {
      flushSync(() => onSelectElements([key]))
    }
    scheduleDragStart(e.nativeEvent)
  }, [selectedElements, onSelectElements, scheduleDragStart])

  return (
    <div className="rounded-md border border-slate-200 bg-white p-2">
      <div className="mb-1.5 flex items-center gap-0.5 px-1">
        {alignButtons.map(({ mode, icon, title }) => (
          <button key={mode} type="button" title={title} disabled={!multiSelected} onClick={() => handleAlign(mode)}
            className={`rounded p-1 transition-colors ${multiSelected ? 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700' : 'text-slate-300 cursor-default'}`}>
            {icon}
          </button>
        ))}
        {multiSelected && (
          <>
            <div className="mx-1.5 h-4 w-px bg-slate-200" />
            <button type="button" onClick={() => setGroupMode(v => !v)}
              title={groupMode ? '打组：围绕整体中心变换' : '解组：围绕各自中心变换'}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${groupMode ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-500'}`}>
              {groupMode ? GROUP_ICON : UNGROUP_ICON}
              {groupMode ? '打组' : '解组'}
            </button>
            <span className="ml-1 text-[10px] text-indigo-500">已选 {selectedElements.length} 个</span>
          </>
        )}
      </div>

      <div ref={containerRef}
        className="relative mx-auto w-full max-w-[920px] overflow-hidden rounded border border-slate-300 bg-black select-none"
        style={{ aspectRatio: popupPreviewAspect === '16:9' ? '16 / 9' : '4 / 3' }}
        onClick={handleContainerClick} onMouseDown={handleContainerMouseDown}>

        <div className="absolute inset-0" data-layer="bg" style={{
          background: hasBgImage ? `url("${bgImageUrl}") center / cover no-repeat, ${theme.backgroundColor || '#000000'}` : (theme.backgroundColor || '#000000'),
        }} />
        <div className="absolute inset-0 pointer-events-none" data-layer="bg" style={{
          background: theme.overlayColor || '#000000',
          opacity: theme.overlayEnabled ? Math.max(0, Math.min(1, theme.overlayOpacity ?? 0.45)) : 0,
        }} />

        {textElements.map(({ key, ref, label }) => {
          const fontSize = key === 'content' ? contentFontPx : key === 'time' ? timeFontPx : countdownFontPx
          const color = key === 'content' ? theme.contentColor : key === 'countdown' ? (theme.countdownColor || theme.timeColor) : theme.timeColor
          const tf = styleTransformByKey[key] ?? 'translate(0px,0px) rotate(0deg) scale(1)'
          return (
            <div key={key} ref={ref as React.RefObject<HTMLDivElement>} data-element-key={key}
              className="absolute cursor-move" style={{
                left: 0, top: 0,
                transform: tf,
                transformOrigin: 'center',
                willChange: selectedElements.includes(key) ? 'transform' : undefined,
                color, fontSize: `${toPreviewPx(fontSize)}px`, fontWeight: getFontWeight(key),
                lineHeight: key === 'countdown' ? 1 : 1.35, whiteSpace: 'pre-wrap', textAlign: theme.textAlign,
                zIndex: selectedElements.includes(key) ? 10 : 1,
                borderRadius: '2px', padding: `${toPreviewPx(4)}px ${toPreviewPx(8)}px`,
                fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
              }}
              onMouseDown={e => handleTextPointerDown(key, e)}
              onClick={e => handleElementClick(key, e)}
              onDoubleClick={e => { e.preventDefault(); e.stopPropagation() }}>
              {label}
            </div>
          )
        })}

        {marqueeRect && (
          <div className="absolute pointer-events-none" style={{
            left: marqueeRect.left, top: marqueeRect.top, width: marqueeRect.width, height: marqueeRect.height,
            border: '1px solid rgba(99, 102, 241, 0.8)', background: 'rgba(99, 102, 241, 0.12)', zIndex: 20,
          }} />
        )}

        {moveableTargets.length > 0 && (
          <Moveable
            ref={moveableRef}
            key={moveableKey}
            target={moveableTarget}
            container={containerRef.current}
            individualGroupable={false}
            useResizeObserver
            defaultGroupOrigin="50% 50%"
            draggable={true}
            rotatable={true}
            scalable={true}
            snappable={true}
            snapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
            elementSnapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
            snapThreshold={5}
            isDisplaySnapDigit={true}
            snapGap={true}
            elementGuidelines={elementGuidelineRefs()}
            horizontalGuidelines={containerRef.current ? [containerRef.current.offsetHeight * 0.25, containerRef.current.offsetHeight * 0.5, containerRef.current.offsetHeight * 0.75] : []}
            verticalGuidelines={containerRef.current ? [containerRef.current.offsetWidth * 0.25, containerRef.current.offsetWidth * 0.5, containerRef.current.offsetWidth * 0.75] : []}
            throttleDrag={0} throttleRotate={0} throttleScale={0.01}
            rotationPosition="top"
            renderDirections={['nw', 'ne', 'sw', 'se']}
            edge={false} keepRatio={true}

            onDragStart={() => { resetMoveableVisualPipeline(); setTransformSyncLocked(true) }}
            onDrag={({ target, transform }) => {
              applyMoveableFrame([{ target, transform }])
            }}
            onDragEnd={({ target, isDrag }) => {
              flushMoveableVisual('sync')
              if (isDrag) finalizeElement(target)
              setTransformSyncLocked(false)
            }}

            onRotateStart={() => { resetMoveableVisualPipeline(); setTransformSyncLocked(true) }}
            onRotate={({ target, transform, afterTransform, inputEvent }) => {
              const css = snapRotateInFullTransform(pickMoveableCssTransform({ transform, afterTransform }), inputEvent)
              applyMoveableFrame([{ target, transform: css }])
            }}
            onRotateEnd={({ target, isDrag }) => {
              flushMoveableVisual('sync')
              if (isDrag) finalizeElement(target)
              setTransformSyncLocked(false)
            }}

            onScaleStart={() => { resetMoveableVisualPipeline(); setTransformSyncLocked(true) }}
            onScale={({ target, transform, afterTransform }) => {
              applyMoveableFrame([{ target, transform: pickMoveableCssTransform({ transform, afterTransform }) }])
            }}
            onScaleEnd={({ target, isDrag }) => {
              flushMoveableVisual('sync')
              if (isDrag) finalizeElement(target)
              setTransformSyncLocked(false)
            }}

            onDragGroupStart={() => { resetMoveableVisualPipeline(); setTransformSyncLocked(true); takeSnapshots() }}
            onDragGroup={({ events }) => {
              applyMoveableFrame(events.map(ev => ({ target: ev.target, transform: ev.transform })))
            }}
            onDragGroupEnd={({ events, isDrag }) => {
              flushMoveableVisual('sync')
              if (isDrag) events.forEach(ev => finalizeElement(ev.target))
              setTransformSyncLocked(false)
            }}

            onRotateGroupStart={() => { resetMoveableVisualPipeline(); setTransformSyncLocked(true); takeSnapshots() }}
            onRotateGroup={({ events, inputEvent }) => {
              if (groupMode) {
                applyMoveableFrame(events.map(ev => ({
                  target: ev.target,
                  transform: snapRotateInFullTransform(pickMoveableCssTransform(ev), inputEvent),
                })))
              } else {
                const firstK = keyOfEl(events[0]?.target)
                const firstSnap = firstK ? snapshotsRef.current.get(firstK) : null
                if (!firstSnap) return
                const evRot = parseTransformValues(pickMoveableCssTransform(events[0])).rotation
                let delta = evRot - firstSnap.t.rotation
                if (inputEvent && (inputEvent as MouseEvent).shiftKey) delta = Math.round(delta / 15) * 15
                const frames = events.map(ev => {
                  const k = keyOfEl(ev.target)
                  const snap = k ? snapshotsRef.current.get(k) : null
                  const tf = snap ? buildTransform(snap.txPx, snap.tyPx, snap.t.rotation + delta, snap.t.scale) : ev.transform
                  return { target: ev.target, transform: tf }
                })
                applyMoveableFrame(frames)
              }
            }}
            onRotateGroupEnd={({ events, isDrag }) => {
              flushMoveableVisual('sync')
              if (isDrag) events.forEach(ev => finalizeElement(ev.target))
              setTransformSyncLocked(false)
            }}

            onScaleGroupStart={() => { resetMoveableVisualPipeline(); setTransformSyncLocked(true); takeSnapshots() }}
            onScaleGroup={({ events }) => {
              if (groupMode) {
                applyMoveableFrame(events.map(ev => ({
                  target: ev.target,
                  transform: pickMoveableCssTransform(ev),
                })))
              } else {
                const firstK = keyOfEl(events[0]?.target)
                const firstSnap = firstK ? snapshotsRef.current.get(firstK) : null
                if (!firstSnap || !firstSnap.t.scale) return
                const evScale = parseTransformValues(pickMoveableCssTransform(events[0])).scale
                const ratio = evScale / firstSnap.t.scale
                const frames = events.map(ev => {
                  const k = keyOfEl(ev.target)
                  const snap = k ? snapshotsRef.current.get(k) : null
                  const tf = snap
                    ? buildTransform(snap.txPx, snap.tyPx, snap.t.rotation, Math.max(0.1, Math.min(5, snap.t.scale * ratio)))
                    : ev.transform
                  return { target: ev.target, transform: tf }
                })
                applyMoveableFrame(frames)
              }
            }}
            onScaleGroupEnd={({ events, isDrag }) => {
              flushMoveableVisual('sync')
              if (isDrag) events.forEach(ev => finalizeElement(ev.target))
              setTransformSyncLocked(false)
            }}
          />
        )}
      </div>
    </div>
  )
}
