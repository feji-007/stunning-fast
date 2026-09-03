import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ApiKeyEntry,
  CardSize,
  CardStyle,
  Feature,
  FeatureId,
  LayoutColumns,
  Provider,
  ProviderId,
  ProviderModel,
  Theme,
  UserState
} from '../types'
import { DEFAULT_FEATURES, PROVIDERS } from '../data/models'
import {
  authApi,
  bootstrapApi,
  clearToken,
  setToken,
  userApiKeysApi,
  userConfigsApi,
  userProvidersApi,
  userModelsApi
} from '../api/client'

type Modal = 'none' | 'login' | 'settings' | 'feedback'

// 视频生成参数默认选项（后端不可达时回退使用）
const DEFAULT_VIDEO_CONFIG: Record<string, Array<{ value: string; label: string }>> = {
  resolution: [
    { value: '720P', label: '720P' },
    { value: '1080P', label: '1080P' }
  ],
  ratio: [
    { value: '16:9', label: '16:9 横屏' },
    { value: '9:16', label: '9:16 竖屏' },
    { value: '1:1', label: '1:1 方形' },
    { value: '4:3', label: '4:3' },
    { value: '3:4', label: '3:4' }
  ],
  duration: [
    { value: '2', label: '2s' },
    { value: '5', label: '5s' },
    { value: '10', label: '10s' },
    { value: '15', label: '15s' },
    { value: '30', label: '30s' }
  ]
}

interface AppState {
  // Layout / navigation
  expanded: boolean // mini floating (false) vs main panel (true)
  activeFeature: FeatureId | null // null => show feature selection; id => show page
  features: Feature[]
  // 主面板布局调整
  columns: LayoutColumns // 网格列数 2/3/4
  cardStyle: CardStyle // 卡片内容样式
  cardSize: CardSize // 卡片密度
  panelWidth: number // 主面板默认宽度（启动/返回主面板时使用）
  panelHeight: number // 主面板默认高度
  panelOpacity: number // 面板背景透明度 0.3~1.0
  theme: Theme // 主题：明色 / 暗色
  // 功能区展示模式：true 时隐藏 toolbar，在原面板上显示功能区网格
  featureViewMode: boolean
  // 自动收起前的状态保存（用于展开后恢复）
  savedFeature: FeatureId | null
  savedFeatureViewMode: boolean
  // 工具栏模式下球的位置（由主进程通过 IPC 事件设置）
  ballSide: 'left' | 'right'
  // Modals
  modal: Modal
  // User
  user: UserState
  // API keys + detected models
  keys: ApiKeyEntry[]
  // Auto launch
  autoLaunch: boolean

  // 后端运行时配置（启动 bootstrap 后从服务器拉取，替代硬编码）
  providers: Provider[]
  videoConfig: Record<string, Array<{ value: string; label: string }>>
  bootstrapped: boolean
  bootstrapError: string

  // Actions
  setExpanded: (v: boolean) => void
  resetToToolbar: () => void
  saveStateBeforeCollapse: () => void
  restoreFromCollapse: () => void
  setBallSide: (side: 'left' | 'right') => void
  openFeature: (id: FeatureId) => void
  backToPanel: () => void
  setModal: (m: Modal) => void
  setColumns: (c: LayoutColumns) => void
  setCardStyle: (s: CardStyle) => void
  setCardSize: (s: CardSize) => void
  setPanelSize: (w: number, h: number) => void
  setPanelOpacity: (v: number) => void
  setTheme: (t: Theme) => void
  toggleFeatureViewMode: () => void
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  register: (username: string, password: string) => Promise<void>
  saveKey: (provider: ProviderId, key: string) => void
  removeKey: (provider: ProviderId) => void
  pinFeature: (id: FeatureId, pinned: boolean) => void
  reorderFeatures: (next: Feature[]) => void
  setAutoLaunch: (v: boolean) => void

  // 后端同步
  bootstrap: () => Promise<void>
  pullUserConfig: () => Promise<void>
  pushUserConfig: () => Promise<void>

  // 用户自定义供应商/模型
  addCustomProvider: (b: {
    id: string
    name: string
    keyHint?: string
    url?: string
  }) => Promise<void>
  addCustomModel: (b: {
    id: string
    providerId: string
    name: string
    type?: string
    description?: string
    supportsI2V?: boolean
  }) => Promise<void>

  // 视频生成表单状态（内存级别，不持久化到 localStorage，
  // 避免大体积 base64 图片撑爆 localStorage 配额；
  // 但能在组件卸载/重新挂载时保留表单内容）
  videoForm: {
    prompt: string
    images: Array<{ url: string; name: string }>
    resolution: string
    ratio: string
    duration: string
    genMode: 't2v' | 'i2v'
    i2vMode: 'firstlast' | 'reference'
    mode: 'auto' | 'manual'
    autoPriority: 'quality' | 'speed' | 'price'
    selected: string | null
  }
  setVideoForm: (patch: Partial<AppState['videoForm']>) => void
  clearVideoForm: () => void
}

// 布局配置同步防抖：拖拽调整时只在停止 800ms 后推送一次
let pushTimer: number | null = null
function schedulePush(get: () => AppState) {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = window.setTimeout(() => {
    pushTimer = null
    void get().pushUserConfig()
  }, 800)
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Start expanded so the full UI shows on launch by default.
      expanded: true,
      activeFeature: null,
      features: DEFAULT_FEATURES,
      // 默认布局：4 列 / 图标+名称+描述 / 标准密度 / 功能页 1200x720
      columns: 4,
      cardStyle: 'icon-name-desc',
      cardSize: 'standard',
      panelWidth: 1200,
      panelHeight: 720,
      panelOpacity: 0.95,
      theme: 'light',
      featureViewMode: false,
      savedFeature: null,
      savedFeatureViewMode: false,
      ballSide: 'left',
      modal: 'none',
      user: { loggedIn: false, userId: null, username: '', token: '' },
      keys: [],
      autoLaunch: false,
      // 运行时配置默认回退到硬编码（bootstrap 成功后被后端数据覆盖）
      providers: PROVIDERS,
      videoConfig: DEFAULT_VIDEO_CONFIG,
      bootstrapped: false,
      bootstrapError: '',

      // 视频生成表单状态：内存级（不在 partialize 中，不写入 localStorage）
      videoForm: {
        prompt: '',
        images: [],
        resolution: '720P',
        ratio: '16:9',
        duration: '5',
        genMode: 't2v',
        i2vMode: 'firstlast',
        mode: 'auto',
        autoPriority: 'quality',
        selected: null
      },
      setVideoForm: (patch) => set((s) => ({ videoForm: { ...s.videoForm, ...patch } })),
      clearVideoForm: () => set({
        videoForm: {
          prompt: '', images: [], resolution: '720P', ratio: '16:9', duration: '5',
          genMode: 't2v', i2vMode: 'firstlast', mode: 'auto', autoPriority: 'quality', selected: null
        }
      }),

      setExpanded: (v) => set({ expanded: v }),
      resetToToolbar: () => {
        // 从悬浮窗展开后回到初始化状态：只展示 toolbar
        set({ expanded: true, activeFeature: null, featureViewMode: false })
      },
      saveStateBeforeCollapse: () => {
        // 收起前保存当前状态，以便展开后恢复
        const { activeFeature, featureViewMode } = get()
        set({ savedFeature: activeFeature, savedFeatureViewMode: featureViewMode })
      },
      restoreFromCollapse: () => {
        // 从悬浮窗展开：恢复到收起前的状态
        const { savedFeature, savedFeatureViewMode, panelWidth, panelHeight } = get()
        set({ expanded: true })
        if (savedFeature) {
          // 恢复到功能页
          try {
            ;(window as any).api?.expandWindowTo?.({ width: panelWidth, height: panelHeight })
          } catch {}
          set({ activeFeature: savedFeature, featureViewMode: false })
        } else if (savedFeatureViewMode) {
          // 恢复到功能区展示
          try {
            ;(window as any).api?.expandWindowTo?.({ width: 680, height: 440 })
          } catch {}
          set({ featureViewMode: true })
        } else {
          // 恢复到工具栏模式：调用 expandWindow 展开窗口
          try {
            ;(window as any).api?.expandWindow?.()
          } catch {}
          set({ activeFeature: null, featureViewMode: false })
        }
        // 清除保存的状态
        set({ savedFeature: null, savedFeatureViewMode: false })
      },
      setBallSide: (side) => set({ ballSide: side }),
      openFeature: (id) => {
        // 使用用户自定义的功能页尺寸
        const { panelWidth, panelHeight } = get()
        try {
          ;(window as any).api?.expandWindowTo?.({
            width: panelWidth,
            height: panelHeight
          })
        } catch {}
        set({ activeFeature: id, expanded: true })
      },
      backToPanel: () => {
        // 返回工具栏模式
        try {
          ;(window as any).api?.expandWindowTo?.({
            width: 450,
            height: 100
          })
        } catch {}
        set({ activeFeature: null, expanded: true })
      },
      setModal: (m) => set({ modal: m }),
      setColumns: (c) => {
        set({ columns: c })
        schedulePush(get)
      },
      setCardStyle: (s) => {
        set({ cardStyle: s })
        schedulePush(get)
      },
      setCardSize: (s) => {
        set({ cardSize: s })
        schedulePush(get)
      },
      setPanelSize: (w, h) => {
        set({ panelWidth: w, panelHeight: h })
        // 同步到主进程 electron-store，下次启动时按此尺寸创建窗口
        try {
          ;(window as any).api?.setPanelSize?.({ width: w, height: h })
        } catch {}
        schedulePush(get)
      },
      setPanelOpacity: (v) => {
        set({ panelOpacity: Math.max(0.3, Math.min(1, v)) })
        schedulePush(get)
      },
      setTheme: (t) => {
        set({ theme: t })
        schedulePush(get)
      },
      toggleFeatureViewMode: () => {
        const next = !get().featureViewMode
        if (next) {
          // 进入功能区展示：原面板内容切换为功能区网格，用紧凑尺寸
          try {
            ;(window as any).api?.expandWindowTo?.({ width: 680, height: 440 })
          } catch {}
        } else {
          // 退出功能区展示：回到工具栏
          try {
            ;(window as any).api?.expandWindowTo?.({ width: 450, height: 100 })
          } catch {}
        }
        set({ featureViewMode: next })
      },

      login: async (username, password) => {
        const res = await authApi.login(username, password)
        setToken(res.token)
        set({
          user: {
            loggedIn: true,
            userId: res.user.id,
            username: res.user.username,
            token: res.token
          },
          modal: 'none'
        })
        // 登录成功后拉取该用户的私有配置（密钥/布局）并合并
        await get().pullUserConfig()
      },
      logout: () => {
        clearToken()
        set({ user: { loggedIn: false, userId: null, username: '', token: '' } })
      },
      register: async (username, password) => {
        const res = await authApi.register(username, password)
        setToken(res.token)
        set({
          user: {
            loggedIn: true,
            userId: res.user.id,
            username: res.user.username,
            token: res.token
          },
          modal: 'none'
        })
        await get().pullUserConfig()
      },

      saveKey: (provider, key) => {
        set((s) => {
          const rest = s.keys.filter((k) => k.provider !== provider)
          return { keys: [...rest, { provider, key }] }
        })
        // 已登录则同步到后端（仅当前用户可见）
        if (get().user.loggedIn) {
          void userApiKeysApi.save(provider, key).catch(() => {})
        }
      },
      removeKey: (provider) => {
        set((s) => ({ keys: s.keys.filter((k) => k.provider !== provider) }))
        if (get().user.loggedIn) {
          void userApiKeysApi.remove(provider).catch(() => {})
        }
      },

      pinFeature: (id, pinned) => {
        set((s) => ({
          features: s.features.map((f) => (f.id === id ? { ...f, pinned } : f))
        }))
        schedulePush(get)
      },
      reorderFeatures: (next) => {
        set({ features: next })
        schedulePush(get)
      },

      setAutoLaunch: (v) => set({ autoLaunch: v }),

      // ===== 后端同步 =====
      bootstrap: async () => {
        try {
          const data = await bootstrapApi.fetch()
          // 构建 models.ts 中系统模型的查找表（用于覆盖数据库中的默认值）
          const modelCapMap = new Map<string, Partial<ProviderModel>>()
          PROVIDERS.forEach((pp) => pp.models.forEach((mm) => {
            const patch: Partial<ProviderModel> = {}
            if (mm.supportsI2V !== undefined)      patch.supportsI2V = mm.supportsI2V
            if (mm.supportsFirstLast !== undefined) patch.supportsFirstLast = mm.supportsFirstLast
            if (mm.supportsReference !== undefined) patch.supportsReference = mm.supportsReference
            if (patch) modelCapMap.set(mm.id, patch)
          }))

          // 映射后端 snake_case → 客户端类型；provider_id → provider，description → desc
          // 系统模型(source=system)的能力字段以 models.ts 为准，覆盖数据库默认值
          const providers: Provider[] = (data.providers ?? []).map((p: any) => ({
            id: p.id as ProviderId,
            name: p.name,
            keyHint: p.key_hint || '',
            url: p.url || '',
            source: (p.source as 'system' | 'user') ?? 'system',
            models: (p.models ?? []).map((m: any) => {
              const base: ProviderModel = {
                id: m.id,
                name: m.name,
                provider: p.id as ProviderId,
                type: m.type ?? 'video',
                desc: m.description || '',
                supportsI2V: !!m.supports_i2v,
                supportsFirstLast: !!m.supports_first_last,
                supportsReference: !!m.supports_reference,
                source: (m.source as 'system' | 'user') ?? 'system'
              }
              const override = modelCapMap.get(m.id)
              if (override && base.source === 'system') return { ...base, ...override }
              return base
            })
          }))
          const features: Feature[] = (data.features ?? []).map((f: any) => ({
            id: f.id as FeatureId,
            name: f.name,
            icon: f.icon || '',
            desc: f.description || '',
            pinned: !!f.pinned
          }))
          // 后端缺失的配置项回退到默认
          const videoConfig: Record<string, Array<{ value: string; label: string }>> = {
            ...DEFAULT_VIDEO_CONFIG,
            ...(data.videoConfig ?? {})
          }
          set({
            providers: providers.length > 0 ? providers : PROVIDERS,
            features: features.length > 0 ? features : get().features,
            videoConfig,
            bootstrapped: true,
            bootstrapError: ''
          })
        } catch (e: any) {
          // 后端不可达：保留硬编码默认值，UI 仍可用
          set({ bootstrapped: true, bootstrapError: e?.message ?? '后台连接失败' })
        }
      },

      pullUserConfig: async () => {
        if (!get().user.loggedIn) return
        try {
          const [keysRes, cfgRes] = await Promise.all([userApiKeysApi.list(), userConfigsApi.list()])
          // 合并密钥：后端记录覆盖本地同 provider
          const remoteKeys: ApiKeyEntry[] = (keysRes.keys ?? []).map((k) => ({
            provider: k.provider_id as ProviderId,
            key: k.encrypted_key
          }))
          set((s) => {
            const byProvider = new Map(s.keys.map((k) => [k.provider, k]))
            for (const rk of remoteKeys) byProvider.set(rk.provider, rk)
            return { keys: Array.from(byProvider.values()) }
          })
          // 应用用户布局配置
          const cfg = cfgRes.configs ?? {}
          const patch: Partial<AppState> = {}
          if (cfg.columns) patch.columns = Number(cfg.columns.value) as LayoutColumns
          if (cfg.cardStyle) patch.cardStyle = cfg.cardStyle.value as CardStyle
          if (cfg.cardSize) patch.cardSize = cfg.cardSize.value as CardSize
          if (cfg.panelWidth) patch.panelWidth = Number(cfg.panelWidth.value)
          if (cfg.panelHeight) patch.panelHeight = Number(cfg.panelHeight.value)
          if (cfg.panelOpacity) patch.panelOpacity = Number(cfg.panelOpacity.value)
          if (cfg.theme) patch.theme = cfg.theme.value as Theme
          if (cfg.features) {
            try {
              patch.features = JSON.parse(cfg.features.value) as Feature[]
            } catch {}
          }
          set(patch)
        } catch {
          // 拉取失败静默：本地配置仍可用
        }
      },

      pushUserConfig: async () => {
        if (!get().user.loggedIn) return
        const s = get()
        const configs = [
          { key: 'columns', value: String(s.columns), type: 'number' },
          { key: 'cardStyle', value: s.cardStyle, type: 'string' },
          { key: 'cardSize', value: s.cardSize, type: 'string' },
          { key: 'panelWidth', value: String(s.panelWidth), type: 'number' },
          { key: 'panelHeight', value: String(s.panelHeight), type: 'number' },
          { key: 'panelOpacity', value: String(s.panelOpacity), type: 'number' },
          { key: 'theme', value: s.theme, type: 'string' },
          { key: 'features', value: JSON.stringify(s.features), type: 'json' }
        ]
        try {
          await userConfigsApi.save(configs)
        } catch {
          // 同步失败静默
        }
      },

      // ===== 用户自定义供应商/模型 =====
      addCustomProvider: async (b) => {
        // 先写入后端，成功后更新本地 store
        await userProvidersApi.create(b)
        const newProvider: Provider = {
          id: b.id as ProviderId,
          name: b.name,
          keyHint: b.keyHint ?? '',
          url: b.url ?? '',
          source: 'user',
          models: []
        }
        set((s) => ({
          providers: [...s.providers.filter((p) => p.id !== b.id), newProvider]
        }))
      },

      addCustomModel: async (b) => {
        await userModelsApi.create(b)
        const newModel = {
          id: b.id,
          name: b.name,
          provider: b.providerId as ProviderId,
          type: (b.type as ProviderModel['type']) ?? 'video',
          desc: b.description ?? '',
          supportsI2V: b.supportsI2V ?? false,
          source: 'user' as const
        }
        set((s) => ({
          providers: s.providers.map((p) =>
            p.id === b.providerId
              ? { ...p, models: [...p.models.filter((m) => m.id !== b.id), newModel] }
              : p
          )
        }))
      }
    }),
    {
      name: 'stunning-fast-store',
      partialize: (s) => ({
        features: s.features,
        user: s.user,
        keys: s.keys,
        autoLaunch: s.autoLaunch,
        columns: s.columns,
        cardStyle: s.cardStyle,
        cardSize: s.cardSize,
        panelWidth: s.panelWidth,
        panelHeight: s.panelHeight,
        panelOpacity: s.panelOpacity,
        theme: s.theme
      })
    }
  )
)

// Derived helpers：基于运行时 providers 计算已接入供应商/可用模型
export function availableProviders(providers: Provider[], keys: ApiKeyEntry[]) {
  const ids = new Set(keys.filter((k) => k.key.trim().length > 0).map((k) => k.provider))
  return providers.filter((p) => ids.has(p.id))
}

export function availableModels(providers: Provider[], keys: ApiKeyEntry[]) {
  return availableProviders(providers, keys).flatMap((p) => p.models)
}

export function hasVideoModel(providers: Provider[], keys: ApiKeyEntry[]) {
  return availableModels(providers, keys).some((m) => m.type === 'video')
}



