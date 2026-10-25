// Shared types and IPC channel definitions between main and renderer process.
 
export const IPC = {
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
  WINDOW_BALL_SIDE: 'window:ball-side',
  // ===== 自动更新 =====
  UPDATER_DOWNLOAD: 'updater:download',
  UPDATER_INSTALL: 'updater:install',
  UPDATER_GET_VERSION: 'updater:get-version',
  UPDATE_WINDOW_CLOSE: 'update-window:close',
  UPDATE_WINDOW_EVENT: 'update-window:event',
  // ===== 模型推荐助手弹窗 =====
  RECOMMENDATION_WINDOW_OPEN: 'recommendation-window:open',
  RECOMMENDATION_WINDOW_CLOSE: 'recommendation-window:close'
} as const
 
export interface ExposedAPI {
  /** Expand the window to the main panel size. */
  expandWindow: () => Promise<void>
  expandWindowTo: (dims: { width: number; height: number }) => Promise<void>
  /** Collapse the window back to the floating mini size. */
  collapseWindow: () => Promise<void>
  /** Move the window to a screen coordinate (used while dragging). */
  moveWindow: (x: number, y: number) => Promise<void>
  /** Remember the last resting position of the floating window. */
  savePosition: (x: number, y: number) => Promise<void>
  getLastPosition: () => Promise<{ x: number; y: number } | null>
  setAlwaysOnTop: (on: boolean) => Promise<void>
  minimizeWindow: () => Promise<void>
  toggleMaximizeWindow: () => Promise<void>
  isMaximized: () => Promise<boolean>
  hideWindow: () => Promise<void>
  quitApp: () => Promise<void>
  getAutoLaunch: () => Promise<boolean>
  setAutoLaunch: (enabled: boolean) => Promise<void>
  onHoverState: (cb: (hovered: boolean) => void) => void
  // 监听主进程窗口折叠/展开事件，返回取消订阅函数。
  onCollapsed: (cb: () => void) => () => void
  onExpanded: (cb: () => void) => () => void
  /** 工具栏模式下球的方位（左/右），由主进程计算后通知渲染进程 */
  onBallSide: (cb: (side: 'left' | 'right') => void) => () => void
  /** 右键菜单：打开设置 */
  onContextMenuSettings: (cb: () => void) => () => void
  /** 显示右键菜单 */
  showContextMenu: (user: { username: string; loggedIn: boolean }) => Promise<void>
  /** 读取主面板自定义默认尺寸（主进程持久化，启动时用） */
  getPanelSize: () => Promise<{ width: number; height: number }>
  /** 写入主面板自定义默认尺寸，下次启动按此尺寸创建窗口 */
  setPanelSize: (dims: { width: number; height: number }) => Promise<void>
  /** 下拉框打开时临时扩展窗口高度，让下拉框能超出主面板 */
  openDropdown: (height: number) => Promise<void>
  /** 下拉框关闭时恢复窗口原始高度 */
  closeDropdown: () => Promise<void>
  /** 在外部浏览器中打开链接 */
  openExternal: (url: string) => Promise<void>
  // 通义万相 (DashScope) 视频生成：主进程负责提交任务 + 轮询，跨进程无 CORS 限制。
  generateVideo: (params: GenerateVideoParams) => Promise<GenerateVideoResult>
  onVideoProgress: (cb: (p: VideoProgress) => void) => () => void
  // ===== 自动更新 =====
  /** 触发下载更新包（用户在弹窗中点击"立即更新"后调用） */
  downloadUpdate: () => Promise<void>
  /** 退出并安装已下载的更新包 */
  installUpdate: () => Promise<void>
  /** 获取当前应用版本号 */
  getCurrentVersion: () => Promise<string>
  /** 发现新版本时触发，回调参数为新版本号 */
  onUpdateAvailable: (cb: (info: { version: string; releaseNotes?: string }) => void) => () => void
  /** 下载进度回调，percent 为 0~100 */
  onUpdateProgress: (cb: (info: { percent: number; bytesPerSecond: number; total: number; transferred: number }) => void) => () => void
  /** 更新包下载完成，可重启安装 */
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => () => void
  /** 更新检查失败（网络等问题），不弹窗，仅日志 */
  onUpdateError: (cb: (err: string) => void) => () => void
  /** 关闭独立更新弹窗窗口 */
  closeUpdateWindow: () => Promise<void>
  /** 主进程推送更新事件到弹窗窗口（phase / progress / version / error） */
  onUpdateWindowEvent: (cb: (data: { phase: string; progress?: number; version?: string; releaseNotes?: string; currentVersion?: string; errorMsg?: string }) => void) => () => void
  // ===== 模型推荐助手弹窗 =====
  /** 打开模型推荐助手独立窗口 */
  openRecommendationWindow: () => Promise<void>
  /** 关闭模型推荐助手独立窗口 */
  closeRecommendationWindow: () => Promise<void>
}
 
/** 视频生成协议：决定请求体格式、鉴权方式与状态映射 */
export type VideoProtocol =
  | 'dashscope'   // 通义万相 DashScope（已实现）
  | 'ark'         // 火山引擎 Ark / Seedance（已实现）
  | 'kling'       // 可灵（已实现）
  | 'minimax'     // MiniMax（API 端点已录入，协议待实现）
  | 'zhipu'       // 智谱 CogVideoX（API 端点已录入，协议待实现）
  | 'runway'      // Runway Gen-3（API 端点已录入，协议待实现）
  | 'luma'        // Luma Dream Machine（API 端点已录入，协议待实现）
  | 'openai'      // OpenAI Sora（API 端点已录入，协议待实现）
  | 'pika'        // Pika（API 端点占位，协议待实现）

export interface GenerateVideoParams {
  /** 供应商 id（用于日志/任务记录） */
  provider: string
  /** 协议类型；由后台供应商配置下发，必填 */
  protocol?: VideoProtocol
  apiKey: string
  /** 模型 id，如 wan2.7-t2v / wan2.1-t2v-turbo / doubao-seedance-2-0-260128 */
  model: string
  prompt: string
  /** 清晰度档位 "720P" | "1080P"（UI 统一大写，各客户端自行归一化），可选 */
  resolution?: string
  /** 宽高比 "16:9" | "9:16" | "1:1" | "4:3" | "3:4"，可选 */
  ratio?: string
  /** 时长（秒），可选 */
  duration?: number
  /** 图生视频：参考图 URL，可选（仅支持图生视频的模型使用） */
  imageUrl?: string
  /** 供应商 API 基础地址（从后端 providers.api_base_url 下发，必填）。 */
  apiBaseUrl?: string
  /** 任务提交路径（相对 apiBaseUrl，如 /services/...），由后台供应商配置下发。 */
  submitPath?: string
  /** 任务查询路径（相对 apiBaseUrl，支持 {taskId} 占位符），由后台供应商配置下发。 */
  statusPath?: string
  /** 图生视频任务提交路径（可选；可灵等独立端点），留空沿用 submitPath */
  submitPathI2v?: string
  /** 图生视频任务查询路径（可选），留空沿用 statusPath */
  statusPathI2v?: string
}
 
export interface GenerateVideoResult {
  videoUrl: string
  taskId?: string
}
 
export interface VideoProgress {
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN'
  message?: string
}
 
declare global {
  interface Window {
    api: ExposedAPI
  }
}