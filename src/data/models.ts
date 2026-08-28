import type { Provider, Feature, FeatureId } from '../types'

// 资源库：目前主流常用的 AI 模型，帮用户搜索更适配的资源
export const PROVIDERS: Provider[] = [
  {
    id: 'alibaba',
    name: '通义万相 (DashScope)',
    keyHint: 'sk-',
    url: 'https://dashscope.aliyun.com/',
    models: [
      {
        id: 'wan2.7-t2v',
        name: 'Wan2.7 文生视频',
        provider: 'alibaba',
        type: 'video',
        desc: '通义万相最新文生视频，2-15s，720P/1080P，含音频，支持多镜头叙事。'
      },
      {
        id: 'wan2.7-t2v-2026-06-12',
        name: 'Wan2.7 (2026-06-12 快照)',
        provider: 'alibaba',
        type: 'video',
        desc: '通义万相 wan2.7 固定版本快照，结果更稳定可复现。'
      },
      {
        id: 'wan2.6-t2v',
        name: 'Wan2.6 文生视频',
        provider: 'alibaba',
        type: 'video',
        desc: '通义万相文生视频，2-15s，1080P，含音频，支持多镜头。'
      },
      {
        id: 'wan2.2-t2v-plus',
        name: 'Wan2.2 文生视频',
        provider: 'alibaba',
        type: 'video',
        desc: '通义万相文生视频，5s，1080P，画质优先。'
      },
      {
        id: 'wan2.1-t2v-turbo',
        name: 'Wan2.1 Turbo 文生视频',
        provider: 'alibaba',
        type: 'video',
        desc: '通义万相文生视频，5s，720P，快速低价，适合尝鲜。'
      },
      {
        id: 'wan2.1-t2v-plus',
        name: 'Wan2.1 Plus 文生视频',
        provider: 'alibaba',
        type: 'video',
        desc: '通义万相文生视频，5s，720P，画质增强。'
      },
      {
        id: 'qwen-max',
        name: 'Qwen-Max',
        provider: 'alibaba',
        type: 'text',
        desc: '通义千问通用大语言模型。'
      }
    ]
  },
  {
    id: 'volcengine',
    name: '火山引擎 (豆包 Seedance)',
    keyHint: '',
    url: 'https://www.volcengine.com/product/doubao-seedance',
    models: [
      {
        id: 'doubao-seedance-2-5',
        name: 'Seedance 2.5',
        provider: 'volcengine',
        type: 'video',
        desc: '字节最新 Seedance 2.5，文生/图生视频，支持多模态参考，最长 30s。',
        supportsI2V: true, supportsFirstLast: true, supportsReference: true
      },
      {
        id: 'doubao-seedance-2-0-260128',
        name: 'Seedance 2.0',
        provider: 'volcengine',
        type: 'video',
        desc: '豆包 Seedance 2.0 标准版，文/图生视频，原生音频，最长 15s。',
        supportsI2V: true, supportsFirstLast: true, supportsReference: true
      },
      {
        id: 'doubao-seedance-2-0-fast-260128',
        name: 'Seedance 2.0 Fast',
        provider: 'volcengine',
        type: 'video',
        desc: '豆包 Seedance 2.0 快速版，速度更快成本更低（不支持 1080p）。',
        supportsI2V: true, supportsFirstLast: true, supportsReference: true
      },
      {
        id: 'doubao-seedance-1-5-pro-251215',
        name: 'Seedance 1.5 Pro',
        provider: 'volcengine',
        type: 'video',
        desc: '豆包 Seedance 1.5 Pro，文/图生视频，4-12s。',
        supportsI2V: true, supportsFirstLast: true, supportsReference: true
      },
      {
        id: 'doubao-seedance-1-0-pro-fast-251015',
        name: 'Seedance 1.0 Pro Fast',
        provider: 'volcengine',
        type: 'video',
        desc: '豆包 Seedance 1.0 Pro Fast，文/图生视频，2-12s，快速。仅支持参考图模式。',
        supportsI2V: true, supportsFirstLast: false, supportsReference: true
      },
      {
        id: 'doubao-pro',
        name: 'Doubao Pro',
        provider: 'volcengine',
        type: 'text',
        desc: '豆包通用文本对话模型。'
      }
    ]
  },
  {
    id: 'kling',
    name: '快手可灵 (Kling)',
    keyHint: 'AccessKey:SecretKey',
    url: 'https://klingai.com/',
    models: [
      {
        id: 'kling-v3',
        name: 'Kling 3.0',
        provider: 'kling',
        type: 'video',
        desc: '可灵最新一代文生视频，画质与一致性最佳，支持更长时长。',
        supportsI2V: true, supportsFirstLast: true, supportsReference: true
      },
      {
        id: 'kling-v2-master',
        name: 'Kling 2.0 Master',
        provider: 'kling',
        type: 'video',
        desc: '可灵 2.0 高质量文生视频，1080p，最长 10s。',
        supportsI2V: true, supportsFirstLast: true, supportsReference: true
      },
      {
        id: 'kling-v2-5-turbo',
        name: 'Kling 2.5 Turbo',
        provider: 'kling',
        type: 'video',
        desc: '可灵 2.5 Turbo，速度更快成本更低，适合快速尝鲜。',
        supportsI2V: true, supportsFirstLast: true, supportsReference: true
      },
      {
        id: 'kling-v1-6',
        name: 'Kling 1.6',
        provider: 'kling',
        type: 'video',
        desc: '可灵上一代视频模型，性价比高。',
        supportsI2V: true, supportsFirstLast: true, supportsReference: true
      }
    ]
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    keyHint: '',
    url: 'https://www.minimaxi.com/',
    models: [
      {
        id: 'video-01',
        name: 'MiniMax Video-01',
        provider: 'minimax',
        type: 'video',
        desc: 'MiniMax 视频生成，擅长人物与运镜。'
      },
      {
        id: 'abab6-5',
        name: 'abab6.5',
        provider: 'minimax',
        type: 'text',
        desc: 'MiniMax 通用大语言模型。'
      }
    ]
  },
  {
    id: 'runway',
    name: 'Runway',
    keyHint: '',
    url: 'https://runwayml.com/',
    models: [
      {
        id: 'gen-3-alpha',
        name: 'Gen-3 Alpha',
        provider: 'runway',
        type: 'video',
        desc: 'Runway Gen-3，高质量文生/图生视频。',
        supportsI2V: true, supportsFirstLast: true, supportsReference: true
      }
    ]
  },
  {
    id: 'pika',
    name: 'Pika',
    keyHint: '',
    url: 'https://pika.art/',
    models: [
      {
        id: 'pika-1-5',
        name: 'Pika 1.5',
        provider: 'pika',
        type: 'video',
        desc: 'Pika 视频生成，特效与 Pikaffects。',
        supportsI2V: true, supportsFirstLast: false, supportsReference: true
      }
    ]
  },
  {
    id: 'luma',
    name: 'Luma AI',
    keyHint: '',
    url: 'https://lumalabs.ai/',
    models: [
      {
        id: 'dream-machine',
        name: 'Dream Machine',
        provider: 'luma',
        type: 'video',
        desc: 'Luma Dream Machine，文/图生视频。',
        supportsI2V: true, supportsFirstLast: false, supportsReference: true
      }
    ]
  },
  {
    id: 'zhipu',
    name: '智谱 AI',
    keyHint: '',
    url: 'https://www.zhipuai.cn/',
    models: [
      {
        id: 'cogvideox',
        name: 'CogVideoX',
        provider: 'zhipu',
        type: 'video',
        desc: '智谱开源视频生成模型。'
      },
      {
        id: 'glm-4',
        name: 'GLM-4',
        provider: 'zhipu',
        type: 'text',
        desc: '智谱通用大语言模型。'
      }
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI',
    keyHint: 'sk-',
    url: 'https://openai.com/',
    models: [
      {
        id: 'sora',
        name: 'Sora',
        provider: 'openai',
        type: 'video',
        desc: 'OpenAI Sora 视频生成模型。'
      },
      {
        id: 'dall-e-3',
        name: 'DALL·E 3',
        provider: 'openai',
        type: 'image',
        desc: 'OpenAI 图像生成。'
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        type: 'text',
        desc: 'OpenAI 通用对话模型。'
      }
    ]
  }
]

export const ALL_MODELS = PROVIDERS.flatMap((p) => p.models)

// 默认主面板功能入口
export const DEFAULT_FEATURES: Feature[] = [
  {
    id: 'video',
    name: '视频生成',
    icon: '🎬',
    desc: '文生视频 / 图生视频，自动匹配或手动切换 API',
    pinned: true
  },
  {
    id: 'library',
    name: '资源库',
    icon: '📚',
    desc: '罗列主流常用模型，搜索最适配的资源',
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


