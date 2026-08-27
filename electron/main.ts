import { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import AutoLaunch from 'auto-launch'
import Store from 'electron-store'
import { IPC } from './shared/ipc'
import { generateVideo } from './video'
import { autoUpdater } from 'electron-updater'

// Window dimension presets -------------------------------------------------
const MINI = { width: 72, height: 72 }
// Default main window size at startup: slim bar (toolbar only).
const MAIN_PANEL = { width: 450, height: 100 }
// Compact panel used for the small collapsed state and the feature selection
// compact view (not used as the startup state anymore).
const PANEL = { width: 450, height: 100 }
const FEATURE_PANEL = { width: 1200, height: 720 }

const store = new Store<{
  lastPos: { x: number; y: number } | null
  autoLaunch: boolean
  panelSize: { width: number; height: number } | null
}>()
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
// Track whether window is currently mini to avoid redundant expand/collapse.
let isMiniMode = false
// 记录展开前的球位置，收起时恢复到此位置
let savedBallPos: { x: number; y: number } | null = null
// Track the base window height so dropdowns can temporarily extend it.
let baseWindowHeight = PANEL.height

const isDev = process.env.NODE_ENV === 'development'

const autoLauncher = new AutoLaunch({
  name: '绝色',
  path: app.getPath('exe'),
  isHidden: true
})

function getTrayIcon(): Tray | null {
  // Build a tray icon defensively: an empty native image can throw on some
  // platforms, so fall back to a 1x1 transparent PNG and never crash startup.
  const emptyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  try {
    const img = nativeImage.createFromDataURL(emptyPng)
    const t = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img)
    t.setToolTip('绝色')
    t.on('click', () => {
      if (!mainWindow) return
      if (mainWindow.isVisible()) mainWindow.hide()
      else mainWindow.show()
    })
    return t
  } catch {
    return null
  }
}

function createWindow(): BrowserWindow {
  const savedPos = store.get('lastPos') as { x: number; y: number } | null
  // 默认使用细长工具栏尺寸 450x100，用户自定义 panelSize 仅用于功能页展开时
  const savedPanelSize = (store.get('panelSize') as { width: number; height: number } | null) ?? null
  const panelW = PANEL.width
  const panelH = PANEL.height
  // 用户自定义的功能页展开尺寸
  const featureW = savedPanelSize?.width ?? FEATURE_PANEL.width
  const featureH = savedPanelSize?.height ?? FEATURE_PANEL.height
  const primary = screen.getPrimaryDisplay()
  const defaultX = primary.workAreaSize.width - panelW - 24
  const defaultY = primary.workAreaSize.height - panelH - 24
  const x = savedPos?.x ?? defaultX
  const y = savedPos?.y ?? defaultY

  const win = new BrowserWindow({
    width: panelW,
    height: panelH,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: true,
    maximizable: true,
    minimizable: true,
    fullscreenable: true,
    skipTaskbar: false,
    alwaysOnTop: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 初始化基准窗口高度
  baseWindowHeight = panelH

  // Keep window inside the visible area of the current display, and remember
  // the last resting position so dragging is preserved across restarts.
  let moveSaveTimer: NodeJS.Timeout | null = null
  const onMove = () => {
    const [wx, wy] = win.getPosition()
    const [ww, wh] = win.getSize()
    const display = screen.getDisplayNearestPoint({ x: wx, y: wy })
    const wa = display.workArea
    const nx = Math.min(Math.max(wx, wa.x), wa.x + wa.width - ww)
    const ny = Math.min(Math.max(wy, wa.y), wa.y + wa.height - wh)
    if (nx !== wx || ny !== wy) win.setPosition(nx, ny)
    // Throttle persistence while the mini window is being dragged.
    if (ww === MINI.width && wh === MINI.height) {
      if (moveSaveTimer) clearTimeout(moveSaveTimer)
      moveSaveTimer = setTimeout(() => {
        const [px, py] = win.getPosition()
        store.set('lastPos', { x: px, y: py })
        moveSaveTimer = null
      }, 400)
    }
  }
  win.on('move', onMove)

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
  win.once('ready-to-show', () => {
    win.show()
    if (isDev) {
      // Open DevTools in a detached window so the inspector is usable while
      // the app window remains small (helps debugging during development).
      try {
        win.webContents.openDevTools({ mode: 'detach' })
      } catch {}
    }
  })
  win.on('closed', () => {
    mainWindow = null
  })
  return win
}

function expandWindow() {
  if (!mainWindow) return
  if (!isMiniMode) return
  const win = mainWindow
  const [wx, wy] = win.getPosition()
  const [ww, wh] = win.getSize()
  // 展开前记录球位置，收起时恢复
  savedBallPos = { x: wx, y: wy }
  const display = screen.getDisplayNearestPoint({ x: wx, y: wy })
  const wa = display.workArea
  // 以窗口中心为锚点扩展到工具栏尺寸 450x100
  const centerX = wx + ww / 2
  const centerY = wy + wh / 2
  let nx = Math.round(centerX - PANEL.width / 2)
  let ny = Math.round(centerY - PANEL.height / 2)
  nx = Math.min(Math.max(nx, wa.x), wa.x + wa.width - PANEL.width)
  ny = Math.min(Math.max(ny, wa.y), wa.y + wa.height - PANEL.height)

  win.setAlwaysOnTop(false)
  win.setSize(PANEL.width, PANEL.height)
  win.setPosition(nx, ny)
  baseWindowHeight = PANEL.height
  win.setResizable(true)
  try {
    win.setSkipTaskbar(false)
    win.setMinimizable(true)
  } catch {}
  try {
    isMiniMode = false
    mainWindow?.webContents.send('window:expanded')
  } catch {}
}

function collapseWindow() {
  if (!mainWindow) return
  if (isMiniMode) return
  const win = mainWindow
  const [ww, wh] = win.getSize()
  const [px, py] = win.getPosition()
  const display = screen.getDisplayNearestPoint({ x: px, y: py })
  const wa = display.workArea

  // 恢复到展开前的球位置（不随展开后的拖动改变）
  let nx: number
  let ny: number
  if (savedBallPos) {
    nx = savedBallPos.x
    ny = savedBallPos.y
    savedBallPos = null
  } else {
    nx = Math.round(px + (ww - MINI.width) / 2)
    ny = Math.round(py + (wh - MINI.height) / 2)
  }
  const clampedX = Math.min(Math.max(nx, wa.x), wa.x + wa.width - MINI.width)
  const clampedY = Math.min(Math.max(ny, wa.y), wa.y + wa.height - MINI.height)

  win.setAlwaysOnTop(true, 'floating')
  win.setSize(MINI.width, MINI.height)
  win.setPosition(clampedX, clampedY)
  try {
    win.setResizable(false)
    win.setSkipTaskbar(true)
    win.setMinimizable(false)
  } catch {}
  try {
    isMiniMode = true
    mainWindow?.webContents.send('window:collapsed')
  } catch {}
}

function registerIpc() {
  ipcMain.handle(IPC.WINDOW_EXPAND, () => {
    expandWindow()
  })

  ipcMain.handle(IPC.WINDOW_COLLAPSE, () => {
    try {
      mainWindow?.webContents.send('window:collapsed')
    } catch {}
    collapseWindow()
  })

  ipcMain.handle(IPC.WINDOW_MOVE, (_e, x: number, y: number) => {
    mainWindow?.setPosition(Math.round(x), Math.round(y))
  })

  ipcMain.handle('window:save-position', (_e, x: number, y: number) => {
    store.set('lastPos', { x: Math.round(x), y: Math.round(y) })
  })

  ipcMain.handle(IPC.WINDOW_GET_POSITION, () => {
    if (!mainWindow) return null
    const [x, y] = mainWindow.getPosition()
    return { x, y }
  })

  ipcMain.handle(IPC.WINDOW_MINIMIZE, () => {
    try {
      mainWindow?.setSkipTaskbar(false)
      mainWindow?.setMinimizable(true)
    } catch {}
    mainWindow?.minimize()
  })

  ipcMain.handle(IPC.WINDOW_TOGGLE_MAXIMIZE, () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })

  ipcMain.handle(IPC.WINDOW_EXPAND_TO, (_e, dims: { width: number; height: number }) => {
    if (!mainWindow) return
    const win = mainWindow
    const [wx, wy] = win.getPosition()
    const [ww, wh] = win.getSize()
    // 从悬浮窗直接展开到功能页时记录球位置
    if (isMiniMode) {
      savedBallPos = { x: wx, y: wy }
    }
    const display = screen.getDisplayNearestPoint({ x: wx, y: wy })
    const wa = display.workArea
    // 以窗口中心为锚点，计算新位置，保证窗口始终在屏幕内
    const centerX = wx + ww / 2
    const centerY = wy + wh / 2
    let nx = Math.round(centerX - dims.width / 2)
    let ny = Math.round(centerY - dims.height / 2)
    nx = Math.min(Math.max(nx, wa.x), wa.x + wa.width - dims.width)
    ny = Math.min(Math.max(ny, wa.y), wa.y + wa.height - dims.height)
    win.setSize(dims.width, dims.height)
    win.setPosition(nx, ny)
    baseWindowHeight = dims.height
    try {
      win.setAlwaysOnTop(false)
      win.setResizable(true)
      win.setSkipTaskbar(false)
      win.setMinimizable(true)
    } catch {}
    try {
      isMiniMode = false
      mainWindow?.webContents.send('window:expanded')
    } catch {}
  })

  ipcMain.handle(IPC.WINDOW_IS_MAXIMIZED, () => {
    return mainWindow?.isMaximized() ?? false
  })

  ipcMain.handle(IPC.WINDOW_HIDE, () => {
    mainWindow?.hide()
  })

  ipcMain.handle(IPC.WINDOW_SET_ALWAYS_ON_TOP, (_e, on: boolean) => {
    mainWindow?.setAlwaysOnTop(on, 'floating')
  })

  ipcMain.handle(IPC.APP_QUIT, () => {
    app.quit()
  })

  ipcMain.handle(IPC.AUTO_LAUNCH_GET, async () => {
    try {
      return await autoLauncher.isEnabled()
    } catch {
      return false
    }
  })

  ipcMain.handle(IPC.AUTO_LAUNCH_SET, async (_e, enabled: boolean) => {
    store.set('autoLaunch', enabled)
    if (enabled) await autoLauncher.enable()
    else await autoLauncher.disable()
  })

  ipcMain.handle(IPC.PANEL_SIZE_GET, () => {
    const saved = store.get('panelSize') as { width: number; height: number } | null
    return saved ?? { width: FEATURE_PANEL.width, height: FEATURE_PANEL.height }
  })

  ipcMain.handle(IPC.PANEL_SIZE_SET, (_e, dims: { width: number; height: number }) => {
    store.set('panelSize', { width: dims.width, height: dims.height })
  })

  // 下拉框打开：临时扩展窗口高度，让下拉框能超出主面板
  ipcMain.handle(IPC.WINDOW_DROPDOWN_OPEN, (_e, dropdownHeight: number) => {
    if (!mainWindow) return
    if (isMiniMode) return
    const win = mainWindow
    const [wx, wy] = win.getPosition()
    const [ww] = win.getSize()
    const newHeight = baseWindowHeight + dropdownHeight
    const display = screen.getDisplayNearestPoint({ x: wx, y: wy })
    const wa = display.workArea
    // 窗口底部固定，向下扩展
    let ny = wy
    const bottom = wy + baseWindowHeight
    const newBottom = wy + newHeight
    // 如果向下扩展会超出屏幕，则向上扩展
    if (newBottom > wa.y + wa.height) {
      ny = Math.max(wa.y, bottom - newHeight)
    }
    win.setSize(ww, newHeight)
    win.setPosition(wx, ny)
    // 强制重绘：transparent 窗口在 Windows 上 resize 后需要切换一次合成模式
    // 否则新增区域不会渲染，导致下拉框被裁剪
    try {
      win.setOpacity(0.99)
      setTimeout(() => win.setOpacity(1.0), 16)
    } catch {}
  })

  // 下拉框关闭：恢复窗口基准高度
  ipcMain.handle(IPC.WINDOW_DROPDOWN_CLOSE, () => {
    if (!mainWindow) return
    if (isMiniMode) return
    const win = mainWindow
    const [wx, wy] = win.getPosition()
    const [ww] = win.getSize()
    const display = screen.getDisplayNearestPoint({ x: wx, y: wy })
    const wa = display.workArea
    let ny = wy
    // 窗口底部固定，向上收缩
    const bottom = wy + win.getSize()[1]
    // 如果窗口底部超出屏幕，调整位置
    if (bottom > wa.y + wa.height) {
      ny = Math.max(wa.y, wa.y + wa.height - baseWindowHeight)
    }
    win.setSize(ww, baseWindowHeight)
    win.setPosition(wx, ny)
    // 强制重绘
    try {
      win.setOpacity(0.99)
      setTimeout(() => win.setOpacity(1.0), 16)
    } catch {}
  })

  // 在外部浏览器中打开链接
  ipcMain.handle(IPC.OPEN_EXTERNAL, (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      shell.openExternal(url)
    }
  })

  // 右键菜单：用户信息 + 设置 + 退出
  ipcMain.handle(IPC.SHOW_CONTEXT_MENU, (e, user: { username: string; loggedIn: boolean }) => {
    const menu = Menu.buildFromTemplate([
      { label: user.loggedIn ? `👤  ${user.username}` : '👤  未登录', enabled: false },
      { type: 'separator' },
      {
        label: '设置',
        click: () => {
          if (!e.sender.isDestroyed()) e.sender.send(IPC.CONTEXT_MENU_SETTINGS)
        }
      },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ])
    menu.popup({ window: mainWindow ?? undefined })
  })

  ipcMain.handle('video:generate', async (e, params) => {
    return generateVideo(params, (p) => {
      if (!e.sender.isDestroyed()) e.sender.send('video:progress', p)
    })
  })
}

app.whenReady().then(() => {
  registerIpc()
  tray = getTrayIcon()
  if (tray) {
    const menu = Menu.buildFromTemplate([
      { label: '显示主面板', click: () => mainWindow?.show() },
      { label: '退出', click: () => app.quit() }
    ])
    tray.setContextMenu(menu)
  }
  mainWindow = createWindow()

  // Restore auto-launch state preference silently.
  const wantAuto = (store.get('autoLaunch') as boolean | undefined) ?? false
  if (wantAuto) autoLauncher.enable().catch(() => {})

  // 自动更新：仅打包后生效（开发模式跳过，避免缺 app-update.yml 报错）
  if (!isDev && app.isPackaged) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = {
      info: (m: string) => console.log('[updater]', m),
      warn: (m: string) => console.warn('[updater]', m),
      error: (m: string) => console.error('[updater]', m)
    }
    autoUpdater.on('update-downloaded', () => {
      // 已下载完成，用户下次退出应用时自动安装更新
      console.log('[updater] 新版本已下载，退出时自动安装')
    })
    autoUpdater.checkForUpdatesAndNotify().catch((e) => {
      console.error('[updater] 检查更新失败', e)
    })
  }
})

app.on('window-all-closed', () => {
  // Keep running in tray on all platforms.
})
