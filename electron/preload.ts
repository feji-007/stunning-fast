import { contextBridge, ipcRenderer } from 'electron'
// 只导入类型（编译时擦除，不生成 require 调用）
import type { ExposedAPI } from './shared/ipc'

// 沙箱模式下 preload 无法 require 本地模块，必须内联 IPC 通道常量
const IPC = {
  WINDOW_EXPAND: 'window:expand',
  WINDOW_EXPAND_TO: 'window:expand-to',
  WINDOW_COLLAPSE: 'window:collapse',
  WINDOW_MOVE: 'window:move',
  WINDOW_GET_POSITION: 'window:get-position',
  WINDOW_HIDE: 'window:hide',
  WINDOW_SET_ALWAYS_ON_TOP: 'window:set-always-on-top',
  APP_QUIT: 'app:quit',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggle-maximize',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  AUTO_LAUNCH_GET: 'auto-launch:get',
  AUTO_LAUNCH_SET: 'auto-launch:set',
  PANEL_SIZE_GET: 'panel-size:get',
  PANEL_SIZE_SET: 'panel-size:set',
  WINDOW_DROPDOWN_OPEN: 'window:dropdown-open',
  WINDOW_DROPDOWN_CLOSE: 'window:dropdown-close',
  OPEN_EXTERNAL: 'open-external',
  SHOW_CONTEXT_MENU: 'show-context-menu',
  CONTEXT_MENU_SETTINGS: 'context-menu:settings',
  WINDOW_BALL_SIDE: 'window:ball-side'
} as const

const api: ExposedAPI = {
  expandWindow: () => ipcRenderer.invoke(IPC.WINDOW_EXPAND),
  expandWindowTo: (dims: { width: number; height: number }) => ipcRenderer.invoke(IPC.WINDOW_EXPAND_TO, dims),
  collapseWindow: () => ipcRenderer.invoke(IPC.WINDOW_COLLAPSE),
  moveWindow: (x, y) => ipcRenderer.invoke(IPC.WINDOW_MOVE, x, y),
  savePosition: (x, y) => ipcRenderer.invoke('window:save-position', x, y),
  getLastPosition: () => ipcRenderer.invoke(IPC.WINDOW_GET_POSITION),
  setAlwaysOnTop: (on) => ipcRenderer.invoke(IPC.WINDOW_SET_ALWAYS_ON_TOP, on),
  hideWindow: () => ipcRenderer.invoke(IPC.WINDOW_HIDE),
  minimizeWindow: () => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
  toggleMaximizeWindow: () => ipcRenderer.invoke(IPC.WINDOW_TOGGLE_MAXIMIZE),
  isMaximized: () => ipcRenderer.invoke(IPC.WINDOW_IS_MAXIMIZED),
  quitApp: () => ipcRenderer.invoke(IPC.APP_QUIT),
  getAutoLaunch: () => ipcRenderer.invoke(IPC.AUTO_LAUNCH_GET),
  setAutoLaunch: (enabled) => ipcRenderer.invoke(IPC.AUTO_LAUNCH_SET, enabled),
  onHoverState: (cb) => {
    ipcRenderer.on('window:hover-state', (_e, hovered: boolean) => cb(hovered))
  },
  onCollapsed: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('window:collapsed', listener)
    return () => {
      ipcRenderer.removeListener('window:collapsed', listener)
    }
  },
  onExpanded: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('window:expanded', listener)
    return () => {
      ipcRenderer.removeListener('window:expanded', listener)
    }
  },
  onBallSide: (cb) => {
    const listener = (_e: unknown, side: 'left' | 'right') => cb(side)
    ipcRenderer.on(IPC.WINDOW_BALL_SIDE, listener)
    return () => {
      ipcRenderer.removeListener(IPC.WINDOW_BALL_SIDE, listener)
    }
  },
  onContextMenuSettings: (cb) => {
    const listener = () => cb()
    ipcRenderer.on(IPC.CONTEXT_MENU_SETTINGS, listener)
    return () => {
      ipcRenderer.removeListener(IPC.CONTEXT_MENU_SETTINGS, listener)
    }
  },
  showContextMenu: (user) => ipcRenderer.invoke(IPC.SHOW_CONTEXT_MENU, user),
  getPanelSize: () => ipcRenderer.invoke(IPC.PANEL_SIZE_GET),
  setPanelSize: (dims) => ipcRenderer.invoke(IPC.PANEL_SIZE_SET, dims),
  openDropdown: (height) => ipcRenderer.invoke(IPC.WINDOW_DROPDOWN_OPEN, height),
  closeDropdown: () => ipcRenderer.invoke(IPC.WINDOW_DROPDOWN_CLOSE),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
  generateVideo: (params) => ipcRenderer.invoke('video:generate', params),
  onVideoProgress: (cb) => {
    const listener = (_e: unknown, p: any) => cb(p)
    ipcRenderer.on('video:progress', listener)
    return () => {
      ipcRenderer.removeListener('video:progress', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
// Debug: print that api was exposed so we can see in renderer DevTools.
try {
  // @ts-ignore
  console.debug('[preload] api exposed')
} catch {}
