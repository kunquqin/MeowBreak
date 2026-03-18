import { BrowserWindow, screen } from 'electron'

/** 弹窗占屏幕面积约 1/5：宽高各为屏的 1/sqrt(5) */
const SIZE_FACTOR = 1 / Math.sqrt(5)

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

export function showReminderPopup(options: ReminderPopupOptions) {
  const { title, body, timeStr } = options
  const primary = screen.getPrimaryDisplay()
  const { width: sw, height: sh } = primary.workAreaSize
  const w = Math.max(320, Math.floor(sw * SIZE_FACTOR))
  const h = Math.max(240, Math.floor(sh * SIZE_FACTOR))
  const x = Math.floor(primary.workArea.x + (sw - w) / 2)
  const y = Math.floor(primary.workArea.y + (sh - h) / 2)

  const win = new BrowserWindow({
    width: w,
    height: h,
    x,
    y,
    frame: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  const titleEsc = escapeHtml(title)
  const bodyEsc = escapeHtml(body)
  const timeEsc = escapeHtml(timeStr)

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleEsc}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: #000; color: #fff; font-family: system-ui, "Microsoft YaHei", sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; }
    .line1 { font-size: clamp(18px, 4vw, 28px); text-align: center; line-height: 1.4; margin-bottom: 12px; }
    .line2 { font-size: clamp(9px, 2vw, 14px); opacity: 0.9; text-align: center; margin-bottom: 24px; }
    .btn { background: #22c55e; color: #fff; border: none; padding: 12px 32px; border-radius: 9999px; font-size: 16px; cursor: pointer; font-weight: 500; }
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

  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  win.setAlwaysOnTop(true, 'screen-saver')
  win.on('closed', () => { win.destroy() })
}
