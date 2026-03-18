import { useState, useEffect } from 'react'
import type { AppSettings } from '../types'

/** 每次使用时读取，避免模块加载时 preload 尚未注入 */
function getApi() {
  return window.electronAPI
}

const defaultSettings: AppSettings = {
  breakfastTime: '08:00',
  lunchTime: '12:00',
  dinnerTime: '18:00',
  activityIntervalMinutes: 45,
  workMinutes: 25,
  breakMinutes: 5,
}

export function Settings() {
  const [settings, setSettingsState] = useState<AppSettings>(defaultSettings)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string>('')
  const [settingsPath, setSettingsPath] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [lastSaveClick, setLastSaveClick] = useState<string>('从未')

  useEffect(() => {
    const api = getApi()
    if (!api) {
      console.warn('[WorkBreak] window.electronAPI 不存在。请用「启动开发环境.bat」打开应用窗口，不要用浏览器打开 localhost')
      setLoading(false)
      return
    }
    console.log('[WorkBreak] electronAPI 已连接')
    api.getSettings().then((s) => {
      setSettingsState(s)
      setLoading(false)
    }).catch((e) => {
      console.error('[WorkBreak] getSettings 失败', e)
      setLoading(false)
    })
    api.getSettingsFilePath().then(setSettingsPath).catch(() => setSettingsPath('(获取失败)'))
  }, [])

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettingsState((prev) => ({ ...prev, [key]: value }))
    setSaveStatus('idle')
    setSaveError('')
  }

  const save = async () => {
    setLastSaveClick(new Date().toLocaleTimeString('zh-CN'))
    const api = getApi()
    console.log('[WorkBreak] 点击保存，当前 settings:', settings, 'electronAPI 存在:', !!api)
    if (!api) {
      console.error('[WorkBreak] 无法保存：electronAPI 不存在')
      setSaveError('未检测到 Electron API。请关闭浏览器标签页，双击「启动开发环境.bat」，在弹出的应用窗口里点保存（不要用浏览器打开 localhost:5173）')
      setSaveStatus('error')
      return
    }
    setSaveStatus('saving')
    setSaveError('')
    try {
      const result = await api.setSettings(settings)
      console.log('[WorkBreak] 保存结果:', result)
      if (result.success) {
        setSettingsState(result.data)
        setSaveStatus('ok')
        setTimeout(() => setSaveStatus('idle'), 3000)
      } else {
        setSaveError(result.error)
        setSaveStatus('error')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[WorkBreak] 保存异常', e)
      setSaveError(msg)
      setSaveStatus('error')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <span className="text-slate-500">加载中…</span>
      </div>
    )
  }

  const isElectron = !!getApi()

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold">WorkBreak 设置</h1>
        <p className="text-sm text-slate-500 mt-0.5">吃饭、活动与休息提醒</p>
        {!isElectron && (
          <div className="mt-2 p-3 bg-amber-100 border border-amber-400 rounded text-amber-800 text-sm">
            <p className="font-medium">当前是浏览器页面，保存无效。</p>
            <p className="mt-1">请关闭此标签页，双击项目里的「启动开发环境.bat」，在<strong>弹出的应用窗口</strong>中修改设置并保存（不要用浏览器打开 localhost:5173）。</p>
          </div>
        )}
        <div className="mt-3 p-3 bg-slate-100 rounded text-xs space-y-1">
          <p><strong>调试信息</strong></p>
          <p>electronAPI: {isElectron ? '已连接' : '未连接（请用 bat 启动）'}</p>
          <p>上次点击保存: {lastSaveClick}</p>
          <p>保存状态: {saveStatus}</p>
          {settingsPath && <p>设置文件: {settingsPath}</p>}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-6 space-y-8">
        <section>
          <h2 className="text-sm font-medium text-slate-700 mb-3">吃饭提醒</h2>
          <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
            <label className="flex items-center justify-between gap-4">
              <span>早餐</span>
              <input
                type="time"
                value={settings.breakfastTime}
                onChange={(e) => update('breakfastTime', e.target.value)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </label>
            <label className="flex items-center justify-between gap-4">
              <span>午餐</span>
              <input
                type="time"
                value={settings.lunchTime}
                onChange={(e) => update('lunchTime', e.target.value)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </label>
            <label className="flex items-center justify-between gap-4">
              <span>晚餐</span>
              <input
                type="time"
                value={settings.dinnerTime}
                onChange={(e) => update('dinnerTime', e.target.value)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </label>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium text-slate-700 mb-3">活动提醒</h2>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <label className="flex items-center justify-between gap-4">
              <span>每隔（分钟）提醒起身活动</span>
              <input
                type="number"
                min={1}
                max={120}
                value={settings.activityIntervalMinutes}
                onChange={(e) =>
                  update('activityIntervalMinutes', Math.max(1, parseInt(e.target.value, 10) || 1))
                }
                className="w-20 rounded border border-slate-300 px-3 py-1.5 text-sm text-right"
              />
            </label>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium text-slate-700 mb-3">休息提醒（番茄钟）</h2>
          <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
            <label className="flex items-center justify-between gap-4">
              <span>工作（分钟）后提醒休息</span>
              <input
                type="number"
                min={1}
                max={60}
                value={settings.workMinutes}
                onChange={(e) =>
                  update('workMinutes', Math.max(1, parseInt(e.target.value, 10) || 1))
                }
                className="w-20 rounded border border-slate-300 px-3 py-1.5 text-sm text-right"
              />
            </label>
            <label className="flex items-center justify-between gap-4">
              <span>建议休息（分钟）</span>
              <input
                type="number"
                min={1}
                max={30}
                value={settings.breakMinutes}
                onChange={(e) =>
                  update('breakMinutes', Math.max(1, parseInt(e.target.value, 10) || 1))
                }
                className="w-20 rounded border border-slate-300 px-3 py-1.5 text-sm text-right"
              />
            </label>
          </div>
        </section>

        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={save}
              disabled={saveStatus === 'saving'}
              className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
            >
              {saveStatus === 'saving' ? '保存中…' : '保存设置'}
            </button>
            {saveStatus === 'ok' && (
              <span className="text-sm font-medium text-green-600">已保存到本地</span>
            )}
            {saveStatus === 'error' && (
              <span className="text-sm font-medium text-red-600">保存失败</span>
            )}
          </div>
          {saveError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">错误：{saveError}</p>
          )}
          {settingsPath && (
            <p className="text-xs text-slate-500">
              设置文件位置：<code className="bg-slate-100 px-1 rounded">{settingsPath}</code>
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
