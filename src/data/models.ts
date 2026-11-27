import type { Provider, Feature, FeatureId } from '../types'

/**
 * 最小离线兜底数据。
 *
 * 供应商与模型的完整配置（名称、能力、API 端点、协议、提交/查询路径、默认参数、文档地址等）
 * 全部由后台数据库维护，客户端仅在后端不可达时使用这里的最小集合，保证界面不空白。
 * 请勿在此补充业务配置；需要调整请到后台「供应商管理 / 模型管理」编辑。
 */
export const FALLBACK_PROVIDERS: Provider[] = [
  {
    id: 'alibaba',
    name: '通义万相 (DashScope)',
    keyHint: 'sk-',
    url: 'https://dashscope.aliyun.com/',
    apiKeyUrl: 'https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key',
    apiBaseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    protocol: 'dashscope',
    submitPath: '/services/aigc/video-generation/video-synthesis',
    statusPath: '/tasks/{taskId}',
    models: [
      {
        id: 'wan2.7-t2v',
        name: 'Wan2.7 文生视频',
        provider: 'alibaba',
        type: 'video',
        desc: '通义万相最新文生视频，2-15s，720P/1080P，含音频，支持多镜头叙事。',
        docsUrl: 'https://help.aliyun.com/zh/model-studio/wan2.7-video-generation',
        resolution: 1080,
        speed: 120,
        price: 3,
        defaultResolution: '1080P',
        defaultRatio: '16:9',
        defaultDuration: '5'
      }
    ]
  },
  {
    id: 'volcengine',
    name: '火山引擎 (豆包 Seedance)',
    keyHint: '',
    url: 'https://www.volcengine.com/product/ark',
    apiKeyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    apiBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    protocol: 'ark',
    submitPath: '/contents/generations/tasks',
    statusPath: '/contents/generations/tasks/{taskId}',
    models: [
      {
        id: 'doubao-seedance-2-5',
        name: 'Seedance 2.5',
        provider: 'volcengine',
        type: 'video',
        desc: '字节最新 Seedance 2.5，文生/图生视频，支持多模态参考，最长 30s。',
        supportsI2V: true,
        supportsFirstLast: true,
        supportsReference: true,
        docsUrl: 'https://www.volcengine.com/docs/82379/1521657',
        resolution: 1080,
        speed: 60,
        price: 3,
        defaultResolution: '1080P',
        defaultRatio: '16:9',
        defaultDuration: '5'
      }
    ]
  },
  {
    id: 'kling',
    name: '快手可灵 (Kling)',
    keyHint: 'API Key',
    url: 'https://klingai.com/',
    apiKeyUrl: 'https://app.klingai.com/cn/dev/api-key',
    apiBaseUrl: 'https://api-beijing.klingai.com',
    protocol: 'kling-v2',
    submitPath: '/text-to-video/{model}',
    statusPath: '/tasks?task_ids={taskId}',
    submitPathI2v: '/image-to-video/{model}',
    statusPathI2v: '/tasks?task_ids={taskId}',
    models: [
      {
        id: 'kling-4.0',
        name: 'Kling 4.0',
        provider: 'kling',
        type: 'video',
        desc: '可灵最新一代，3-30s，支持 4K、多镜头叙事与全能参考。',
        supportsI2V: true,
        supportsFirstLast: true,
        supportsReference: true,
        docsUrl: 'https://klingai.com/document-api',
        resolution: 1080,
        speed: 120,
        price: 4,
        defaultResolution: '1080P',
        defaultRatio: '16:9',
        defaultDuration: '5'
      },
      {
        id: 'kling-4.0-flash',
        name: 'Kling 4.0 Flash',
        provider: 'kling',
        type: 'video',
        desc: '可灵 4.0 快速版，3-20s，720P，性价比高。',
        supportsI2V: true,
        supportsFirstLast: false,
        supportsReference: true,
        docsUrl: 'https://klingai.com/document-api',
        resolution: 720,
        speed: 30,
        price: 2,
        defaultResolution: '720P',
        defaultRatio: '16:9',
        defaultDuration: '5'
      },
      {
        id: 'kling-3.0-turbo',
        name: 'Kling 3.0 Turbo',
        provider: 'kling',
        type: 'video',
        desc: '可灵 3.0 Turbo，3-15s，原生音频，效果稳定、性价比更优。',
        supportsI2V: true,
        supportsFirstLast: false,
        supportsReference: false,
        docsUrl: 'https://klingai.com/document-api',
        resolution: 1080,
        speed: 45,
        price: 2,
        defaultResolution: '1080P',
        defaultRatio: '16:9',
        defaultDuration: '5'
      }
    ]
  }
]

// 默认主面板功能入口（后端 features 为空时的最小兜底）
export const DEFAULT_FEATURES: Feature[] = [
  {
    id: 'library',
    name: '资源库',
    icon: '📚',
    desc: 'AI 视频工具导购：挑工具、看价格、配 API',
    pinned: true
  },
  {
    id: 'video',
    name: '视频生成',
    icon: '🎬',
    desc: '已配置 Key 的工具可在此快速体验生成',
    pinned: true
  },
  {
    id: 'custom',
    name: '自定义',
    icon: '🎨',
    desc: 'DIY 界面，调整核心功能展示位',
    pinned: true
  },
  {
    id: 'image',
    name: '图像生成',
    icon: '🖼️',
    desc: '文生图，主流模型可选',
    pinned: true
  },
  {
    id: 'audio',
    name: '语音合成',
    icon: '🎙️',
    desc: '文本转语音，多音色可选',
    pinned: false
  },
  {
    id: 'chat',
    name: 'AI 对话',
    icon: '💬',
    desc: '通用大模型对话',
    pinned: false
  }
]

export function featureById(id: FeatureId): Feature | undefined {
  return DEFAULT_FEATURES.find((f) => f.id === id)
}
