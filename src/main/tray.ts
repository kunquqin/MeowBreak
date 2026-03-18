import { nativeImage, Tray, Menu, BrowserWindow } from 'electron'

/** 16x16 简单托盘图标（灰底 + 深色） */
const TRAY_ICON_DATA =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOklEQVQ4T2NkYGD4z0ABYBzVMGoB1AIMDP8ZGBj+M/xnYGD8z8DAwMgw6gYGBgZGBkYGBob/ow4YdQODAwMAuIkL/0eLhJAAAAAASUVORK5CYII='

let tray: Tray | null = null

export function createTray(mainWindow: BrowserWindow) {
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA)
  const size = process.platform === 'win32' ? 32 : 22
  tray = new Tray(icon.resize({ width: size, height: size }))

  const contextMenu = Menu.buildFromTemplate([
    { label: '打开设置', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: '退出', click: () => globalThis.workbreakQuit?.() },
  ])

  tray.setToolTip('WorkBreak - 吃饭·活动·休息提醒')
  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => mainWindow?.show())
  tray.on('click', () => mainWindow?.show())
}

export function destroyTray() {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
