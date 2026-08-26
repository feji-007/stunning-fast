import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ApiKeyEntry,
  CardSize,
  CardStyle,
  Feature,
  FeatureId,
  LayoutColumns,
  ProviderId,
  UserState
} from '../types'
import { DEFAULT_FEATURES, PROVIDERS } from '../data/models'

type Modal = 'none' | 'login' | 'settings'

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
  toggleFeatureViewMode: () => void
  login: (username: string) => void
  logout: () => void
  register: (username: string) => void
  saveKey: (provider: ProviderId, key: string) => void
  removeKey: (provider: ProviderId) => void
  pinFeature: (id: FeatureId, pinned: boolean) => void
  reorderFeatures: (next: Feature[]) => void
  setAutoLaunch: (v: boolean) => void
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
      featureViewMode: false,
      savedFeature: null,
      savedFeatureViewMode: false,
      ballSide: 'left',
      modal: 'none',
      user: { loggedIn: false, username: '', token: '' },
      keys: [],
      autoLaunch: false,

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
      setColumns: (c) => set({ columns: c }),
      setCardStyle: (s) => set({ cardStyle: s }),
      setCardSize: (s) => set({ cardSize: s }),
      setPanelSize: (w, h) => {
        set({ panelWidth: w, panelHeight: h })
        // 同步到主进程 electron-store，下次启动时按此尺寸创建窗口
        try {
          ;(window as any).api?.setPanelSize?.({ width: w, height: h })
        } catch {}
      },
      setPanelOpacity: (v) => set({ panelOpacity: Math.max(0.3, Math.min(1, v)) }),
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

      login: (username) =>
        set({
          user: {
            loggedIn: true,
            username,
            token: 'sim-' + Math.random().toString(36).slice(2)
          },
          modal: 'none'
        }),
      logout: () =>
        set({ user: { loggedIn: false, username: '', token: '' } }),
      register: (username) =>
        set({
          user: {
            loggedIn: true,
            username,
            token: 'sim-' + Math.random().toString(36).slice(2)
          },
          modal: 'none'
        }),

      saveKey: (provider, key) =>
        set((s) => {
          const rest = s.keys.filter((k) => k.provider !== provider)
          return { keys: [...rest, { provider, key }] }
        }),
      removeKey: (provider) =>
        set((s) => ({ keys: s.keys.filter((k) => k.provider !== provider) })),

      pinFeature: (id, pinned) =>
        set((s) => ({
          features: s.features.map((f) => (f.id === id ? { ...f, pinned } : f))
        })),
      reorderFeatures: (next) => set({ features: next }),

      setAutoLaunch: (v) => set({ autoLaunch: v })
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
        panelOpacity: s.panelOpacity
      })
    }
  )
)

// Derived helpers
export function availableProviders(keys: ApiKeyEntry[]) {
  const ids = new Set(keys.filter((k) => k.key.trim().length > 0).map((k) => k.provider))
  return PROVIDERS.filter((p) => ids.has(p.id))
}

export function availableModels(keys: ApiKeyEntry[]) {
  return availableProviders(keys).flatMap((p) => p.models)
}

export function hasVideoModel(keys: ApiKeyEntry[]) {
  return availableModels(keys).some((m) => m.type === 'video')
}
