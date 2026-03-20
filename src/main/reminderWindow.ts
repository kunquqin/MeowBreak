import { BrowserWindow, screen } from 'electron'

export interface ReminderPopupOptions {
  title: string
  body: string
  timeStr: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildReminderHtml(options: ReminderPopupOptions): string {
  const { title, body, timeStr } = options
  const titleEsc = escapeHtml(title)
  const bodyEsc = escapeHtml(body)
  const timeEsc = escapeHtml(timeStr)

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleEsc}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: #000; color: #fff; font-family: system-ui, "Microsoft YaHei", sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: min(5vw, 48px); }
    .line1 { font-size: clamp(28px, 6vw, 72px); text-align: center; line-height: 1.35; margin-bottom: clamp(16px, 3vw, 40px); font-weight: 600; max-width: 96vw; }
    .line2 { font-size: clamp(16px, 3vw, 36px); opacity: 0.9; text-align: center; margin-bottom: clamp(32px, 5vw, 64px); }
    .btn { background: #22c55e; color: #fff; border: none; padding: clamp(14px, 2vw, 24px) clamp(40px, 8vw, 96px); border-radius: 9999px; font-size: clamp(18px, 2.5vw, 32px); cursor: pointer; font-weight: 500; }
    .btn:hover { background: #16a34a; }
  </style>
</head>
<body>
  <div class="line1">${titleEsc} · ${bodyEsc}</div>
  <div class="line2">${timeEsc}</div>
  <button class="btn" id="closeBtn">知道了</button>
  <script>
    document.getElementById('closeBtn').onclick = function() { window.close(); };
  </script>
</body>
</html>`
}

/** 全局唯一提醒弹窗：新提醒覆盖当前内容，不叠多个窗口 */
let reminderPopupWindow: BrowserWindow | null = null

function applyDisplayBounds(win: BrowserWindow) {
  const primary = screen.getPrimaryDisplay()
  const { x, y, width, height } = primary.bounds
  win.setBounds({ x, y, width, height })
}

function presentReminderWindow(win: BrowserWindow) {
  if (win.isDestroyed()) return
  win.show()
  win.focus()
  win.setAlwaysOnTop(true, 'screen-saver')
}

/** 到点提醒：铺满当前主显示器（含任务栏区域，与任务栏重叠） */
export function showReminderPopup(options: ReminderPopupOptions) {
  const html = buildReminderHtml(options)
  const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(html)

  if (reminderPopupWindow && !reminderPopupWindow.isDestroyed()) {
    applyDisplayBounds(reminderPopupWindow)
    void reminderPopupWindow.loadURL(url).then(() => {
      const w = reminderPopupWindow
      if (w && !w.isDestroyed()) presentReminderWindow(w)
    }).catch(() => {
      /* ignore load errors */
    })
    return
  }

  const primary = screen.getPrimaryDisplay()
  const { x, y, width, height } = primary.bounds

  reminderPopupWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  reminderPopupWindow.on('closed', () => {
    reminderPopupWindow = null
  })

  void reminderPopupWindow.loadURL(url).then(() => {
    const w = reminderPopupWindow
    if (w && !w.isDestroyed()) presentReminderWindow(w)
  }).catch(() => {
    /* ignore load errors */
  })
}

/** 若存在提醒弹窗则关闭（例如应用退出前可选调用） */
export function closeReminderPopupIfAny() {
  if (reminderPopupWindow && !reminderPopupWindow.isDestroyed()) {
    reminderPopupWindow.close()
    reminderPopupWindow = null
  }
}

/* ─── 休息即将结束：倒计时弹窗 ─── */

function buildRestEndCountdownHtml(countdownSec: number, title: string): string {
  const titleEsc = escapeHtml(title)
  const sec = Math.max(1, Math.min(countdownSec, 99))
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>休息即将结束</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: #000; color: #fff; font-family: system-ui, "Microsoft YaHei", sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: min(5vw, 48px); }
    .title { font-size: clamp(20px, 4vw, 48px); opacity: 0.8; text-align: center; margin-bottom: clamp(8px, 1.5vw, 20px); }
    .subtitle { font-size: clamp(28px, 6vw, 72px); text-align: center; font-weight: 600; margin-bottom: clamp(24px, 4vw, 56px); }
    .countdown { font-size: clamp(80px, 20vw, 240px); font-weight: 700; text-align: center; line-height: 1; font-variant-numeric: tabular-nums; transition: transform 0.15s ease-out, opacity 0.15s ease-out; }
    .countdown.tick { transform: scale(1.15); opacity: 0.7; }
  </style>
</head>
<body>
  <div class="title">${titleEsc}</div>
  <div class="subtitle">休息即将结束</div>
  <div class="countdown" id="cd">${sec}</div>
  <script>
    (function(){
      var remaining = ${sec};
      var el = document.getElementById('cd');
      function tick() {
        remaining--;
        if (remaining <= 0) {
          el.textContent = '0';
          setTimeout(function(){ window.close(); }, 300);
          return;
        }
        el.textContent = String(remaining);
        el.classList.add('tick');
        setTimeout(function(){ el.classList.remove('tick'); }, 150);
        setTimeout(tick, 1000);
      }
      setTimeout(tick, 1000);
    })();
  </script>
</body>
</html>`
}

/**
 * 休息即将结束倒计时弹窗：全屏黑底，大数字从 countdownSec 倒数到 0 后自动关闭。
 * 复用同一个 reminderPopupWindow 单例（覆盖当前休息提醒弹窗内容）。
 */
export function showRestEndCountdownPopup(countdownSec: number, title: string) {
  const html = buildRestEndCountdownHtml(countdownSec, title)
  const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(html)

  if (reminderPopupWindow && !reminderPopupWindow.isDestroyed()) {
    applyDisplayBounds(reminderPopupWindow)
    void reminderPopupWindow.loadURL(url).then(() => {
      const w = reminderPopupWindow
      if (w && !w.isDestroyed()) presentReminderWindow(w)
    }).catch(() => {})
    return
  }

  const primary = screen.getPrimaryDisplay()
  const { x, y, width, height } = primary.bounds

  reminderPopupWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  reminderPopupWindow.on('closed', () => {
    reminderPopupWindow = null
  })

  void reminderPopupWindow.loadURL(url).then(() => {
    const w = reminderPopupWindow
    if (w && !w.isDestroyed()) presentReminderWindow(w)
  }).catch(() => {})
}
