import { query, queryOne } from './pool'
import { config } from '../config'
import { hashPassword } from '../utils/password'

/**
 * 种子数据：仅在对应表为空时插入，不覆盖管理员后续的修改。
 * 每次启动都会执行检查，已存在数据则跳过。
 */

// 从客户端初始化数据迁移而来的供应商 + 模型（仅用于首次建库；之后完全以后台数据库为准）
const PROVIDERS_SEED: Array<{
  id: string; name: string; keyHint: string; url: string; apiBaseUrl?: string; sort: number
  protocol?: string; submitPath?: string; statusPath?: string
  submitPathI2v?: string; statusPathI2v?: string
  models: Array<{
    id: string; name: string; type: string; desc: string
    supportsI2V?: boolean; supportsFirstLast?: boolean; supportsReference?: boolean
    res: number; speed: number; price: number; sort: number
  }>
}> = [
  {
    id: 'alibaba', name: '通义万相 (DashScope)', keyHint: 'sk-',
    url: 'https://dashscope.aliyun.com/', apiBaseUrl: 'https://dashscope.aliyuncs.com/api/v1', sort: 1,
    protocol: 'dashscope',
    submitPath: '/services/aigc/video-generation/video-synthesis',
    statusPath: '/tasks/{taskId}',
    models: [
      { id: 'wan2.7-t2v', name: 'Wan2.7 文生视频', type: 'video', desc: '通义万相最新文生视频，2-15s，720P/1080P，含音频，支持多镜头叙事。', res: 1080, speed: 120, price: 3, sort: 1 },
      { id: 'wan2.7-t2v-2026-06-12', name: 'Wan2.7 (2026-06-12 快照)', type: 'video', desc: '通义万相 wan2.7 固定版本快照，结果更稳定可复现。', res: 1080, speed: 120, price: 3, sort: 2 },
      { id: 'wan2.6-t2v', name: 'Wan2.6 文生视频', type: 'video', desc: '通义万相文生视频，2-15s，1080P，含音频，支持多镜头。', res: 1080, speed: 100, price: 3, sort: 3 },
      { id: 'wan2.2-t2v-plus', name: 'Wan2.2 文生视频', type: 'video', desc: '通义万相文生视频，5s，1080P，画质优先。', res: 1080, speed: 90, price: 2, sort: 4 },
      { id: 'wan2.1-t2v-turbo', name: 'Wan2.1 Turbo 文生视频', type: 'video', desc: '通义万相文生视频，5s，720P，快速低价，适合尝鲜。', res: 720, speed: 30, price: 1, sort: 5 },
      { id: 'wan2.1-t2v-plus', name: 'Wan2.1 Plus 文生视频', type: 'video', desc: '通义万相文生视频，5s，720P，画质增强。', res: 720, speed: 60, price: 2, sort: 6 },
      { id: 'qwen-max', name: 'Qwen-Max', type: 'text', desc: '通义千问通用大语言模型。', res: 0, speed: 0, price: 1, sort: 7 }
    ]
  },
  {
    id: 'volcengine', name: '火山引擎 (豆包 Seedance)', keyHint: '',
    url: 'https://www.volcengine.com/product/ark', apiBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3', sort: 2,
    protocol: 'ark',
    submitPath: '/contents/generations/tasks',
    statusPath: '/contents/generations/tasks/{taskId}',
    models: [
      { id: 'doubao-seedance-2-5', name: 'Seedance 2.5', type: 'video', desc: '字节最新 Seedance 2.5，文生/图生视频，支持多模态参考，最长 30s。', supportsI2V: true, supportsFirstLast: true, supportsReference: true, res: 1080, speed: 60, price: 3, sort: 1 },
      { id: 'doubao-seedance-2-0-260128', name: 'Seedance 2.0', type: 'video', desc: '豆包 Seedance 2.0 标准版，文/图生视频，原生音频，最长 15s。', supportsI2V: true, supportsFirstLast: true, supportsReference: true, res: 1080, speed: 45, price: 2, sort: 2 },
      { id: 'doubao-seedance-2-0-fast-260128', name: 'Seedance 2.0 Fast', type: 'video', desc: '豆包 Seedance 2.0 快速版，速度更快成本更低（不支持 1080p）。', supportsI2V: true, supportsFirstLast: true, supportsReference: true, res: 720, speed: 20, price: 1, sort: 3 },
      { id: 'doubao-seedance-1-5-pro-251215', name: 'Seedance 1.5 Pro', type: 'video', desc: '豆包 Seedance 1.5 Pro，文/图生视频，4-12s。', supportsI2V: true, supportsFirstLast: true, supportsReference: true, res: 720, speed: 30, price: 2, sort: 4 },
      { id: 'doubao-seedance-1-0-pro-fast-251015', name: 'Seedance 1.0 Pro Fast', type: 'video', desc: '豆包 Seedance 1.0 Pro Fast，文/图生视频，2-12s，快速。', supportsI2V: true, supportsFirstLast: false, supportsReference: true, res: 720, speed: 15, price: 1, sort: 5 },
      { id: 'doubao-pro', name: 'Doubao Pro', type: 'text', desc: '豆包通用文本对话模型。', res: 0, speed: 0, price: 1, sort: 6 }
    ]
  },
  {
    id: 'kling', name: '快手可灵 (Kling)', keyHint: 'AccessKey:SecretKey',
    url: 'https://klingai.com/', apiBaseUrl: 'https://api-beijing.klingai.com/v1', sort: 3,
    // 可灵文生/图生视频使用不同端点，均在此配置，主进程不再内置路径
    protocol: 'kling',
    submitPath: '/videos/text2video',
    statusPath: '/videos/text2video/{taskId}',
    submitPathI2v: '/videos/image2video',
    statusPathI2v: '/videos/image2video/{taskId}',
    models: [
      { id: 'kling-v3', name: 'Kling 3.0', type: 'video', desc: '可灵最新一代文生视频，画质与一致性最佳，支持更长时长。', supportsI2V: true, supportsFirstLast: true, supportsReference: true, res: 1080, speed: 120, price: 3, sort: 1 },
      { id: 'kling-v2-master', name: 'Kling 2.0 Master', type: 'video', desc: '可灵 2.0 高质量文生视频，1080p，最长 10s。', supportsI2V: true, supportsFirstLast: true, supportsReference: true, res: 1080, speed: 90, price: 3, sort: 2 },
      { id: 'kling-v2-5-turbo', name: 'Kling 2.5 Turbo', type: 'video', desc: '可灵 2.5 Turbo，速度更快成本更低，适合快速尝鲜。', supportsI2V: true, supportsFirstLast: true, supportsReference: true, res: 720, speed: 30, price: 1, sort: 3 },
      { id: 'kling-v1-6', name: 'Kling 1.6', type: 'video', desc: '可灵上一代视频模型，性价比高。', supportsI2V: true, supportsFirstLast: true, supportsReference: true, res: 720, speed: 60, price: 2, sort: 4 }
    ]
  },
  {
    id: 'minimax', name: 'MiniMax', keyHint: '', url: 'https://www.minimaxi.com/', sort: 4,
    protocol: 'minimax', apiBaseUrl: 'https://api.minimaxi.com',
    submitPath: '/v1/video_generation', statusPath: '/v1/query/video_generation?task_id={taskId}',
    models: [
      { id: 'video-01', name: 'MiniMax Video-01', type: 'video', desc: 'MiniMax 视频生成，擅长人物与运镜。', res: 720, speed: 60, price: 2, sort: 1 },
      { id: 'abab6-5', name: 'abab6.5', type: 'text', desc: 'MiniMax 通用大语言模型。', res: 0, speed: 0, price: 1, sort: 2 }
    ]
  },
  {
    id: 'runway', name: 'Runway', keyHint: '', url: 'https://runwayml.com/', sort: 5,
    protocol: 'runway', apiBaseUrl: 'https://api.dev.runwayml.com',
    submitPath: '/v1/text_to_video', statusPath: '/v1/tasks/{taskId}',
    models: [
      { id: 'gen-3-alpha', name: 'Gen-3 Alpha', type: 'video', desc: 'Runway Gen-3，高质量文生/图生视频。', supportsI2V: true, supportsFirstLast: true, supportsReference: true, res: 1080, speed: 60, price: 3, sort: 1 }
    ]
  },
  {
    id: 'pika', name: 'Pika', keyHint: '', url: 'https://pika.art/', sort: 6,
    protocol: 'pika', apiBaseUrl: 'https://pika.pikaslabs.com/v1',
    submitPath: '/v1/videos', statusPath: '/v1/videos/{taskId}',
    models: [
      { id: 'pika-1-5', name: 'Pika 1.5', type: 'video', desc: 'Pika 视频生成，特效与 Pikaffects。', supportsI2V: true, supportsFirstLast: false, supportsReference: true, res: 720, speed: 30, price: 2, sort: 1 }
    ]
  },
  {
    id: 'luma', name: 'Luma AI', keyHint: '', url: 'https://lumalabs.ai/', sort: 7,
    protocol: 'luma', apiBaseUrl: 'https://api.lumalabs.ai/dream-machine/v1',
    submitPath: '/generations', statusPath: '/generations/{taskId}',
    models: [
      { id: 'dream-machine', name: 'Dream Machine', type: 'video', desc: 'Luma Dream Machine，文/图生视频。', supportsI2V: true, supportsFirstLast: false, supportsReference: true, res: 720, speed: 60, price: 2, sort: 1 }
    ]
  },
  {
    id: 'zhipu', name: '智谱 AI', keyHint: '', url: 'https://www.zhipuai.cn/', sort: 8,
    protocol: 'zhipu', apiBaseUrl: 'https://open.bigmodel.cn',
    submitPath: '/api/paas/v4/videos/generations', statusPath: '/api/paas/v4/videos/generations/{taskId}',
    models: [
      { id: 'cogvideox', name: 'CogVideoX', type: 'video', desc: '智谱开源视频生成模型。', res: 720, speed: 60, price: 1, sort: 1 },
      { id: 'glm-4', name: 'GLM-4', type: 'text', desc: '智谱通用大语言模型。', res: 0, speed: 0, price: 1, sort: 2 }
    ]
  },
  {
    id: 'openai', name: 'OpenAI', keyHint: 'sk-', url: 'https://openai.com/', sort: 9,
    protocol: 'openai', apiBaseUrl: 'https://api.openai.com',
    submitPath: '/v1/videos', statusPath: '/v1/videos/{taskId}',
    models: [
      { id: 'sora-2', name: 'Sora 2', type: 'video', desc: 'OpenAI Sora 2 视频生成模型。', res: 1080, speed: 60, price: 3, sort: 1 },
      { id: 'dall-e-3', name: 'DALL\u00b7E 3', type: 'image', desc: 'OpenAI 图像生成。', res: 0, speed: 0, price: 2, sort: 2 },
      { id: 'gpt-4o', name: 'GPT-4o', type: 'text', desc: 'OpenAI 通用对话模型。', res: 0, speed: 0, price: 3, sort: 3 }
    ]
  }
]

const FEATURES_SEED: Array<{
  id: string; name: string; icon: string; desc: string; pinned: boolean; sort: number
}> = [
  { id: 'video', name: '视频生成', icon: '\u{1F3AC}', desc: '文生视频 / 图生视频，自动匹配或手动切换 API', pinned: true, sort: 1 },
  { id: 'library', name: '资源库', icon: '\u{1F4DA}', desc: '罗列主流常用模型，搜索最适配的资源', pinned: true, sort: 2 },
  { id: 'custom', name: '自定义', icon: '\u{1F3A8}', desc: 'DIY 界面，调整核心功能展示位', pinned: true, sort: 3 },
  { id: 'image', name: '图像生成', icon: '\u{1F5BC}\uFE0F', desc: '文生图，主流模型可选', pinned: true, sort: 4 },
  { id: 'audio', name: '语音合成', icon: '\u{1F3A4}', desc: '文本转语音，多音色可选', pinned: false, sort: 5 },
  { id: 'chat', name: 'AI 对话', icon: '\u{1F4AC}', desc: '通用大模型对话', pinned: false, sort: 6 }
]

// 视频生成参数选项：分辨率 / 宽高比 / 时长 / 自动匹配优先级
const VIDEO_CONFIG_SEED: Array<{
  key: string; value: string; label: string; sort: number
}> = [
  { key: 'resolution', value: '720P', label: '720P', sort: 1 },
  { key: 'resolution', value: '1080P', label: '1080P', sort: 2 },
  { key: 'ratio', value: '16:9', label: '16:9 横屏', sort: 1 },
  { key: 'ratio', value: '9:16', label: '9:16 竖屏', sort: 2 },
  { key: 'ratio', value: '1:1', label: '1:1 方形', sort: 3 },
  { key: 'ratio', value: '4:3', label: '4:3', sort: 4 },
  { key: 'ratio', value: '3:4', label: '3:4', sort: 5 },
  { key: 'duration', value: '2', label: '2s', sort: 1 },
  { key: 'duration', value: '5', label: '5s', sort: 2 },
  { key: 'duration', value: '10', label: '10s', sort: 3 },
  { key: 'duration', value: '15', label: '15s', sort: 4 },
  { key: 'duration', value: '30', label: '30s', sort: 5 },
  { key: 'priority', value: 'quality', label: '清晰度优先', sort: 1 },
  { key: 'priority', value: 'speed', label: '速度优先', sort: 2 },
  { key: 'priority', value: 'price', label: '价格优先', sort: 3 }
]

// 模型推荐助手：6 个模型的展示信息（从客户端 RecommendationAssistantModal.tsx 迁移）
const RECOMMEND_MODELS_SEED: Array<{
  id: string; name: string; desc: string; tag: string; sort: number
}> = [
  { id: '可灵', name: '可灵 Kling', desc: '擅长叙事性视频、角色一致性、智能分镜，多语言对话支持。适合有情节、需要多镜头切换的视频。', tag: '叙事 · 角色一致 · 分镜', sort: 1 },
  { id: 'Seedance', name: 'Seedance', desc: '快速批量产出，30秒单次生成，性价比高。适合产品展示、效率优先的场景。', tag: '量产 · 快速 · 30秒', sort: 2 },
  { id: 'Veo', name: 'Veo', desc: '对专业摄影术语理解极强，精确运镜控制，原生音频生成。适合追求电影感和画面质感的短片。', tag: '电影感 · 运镜 · 原生音频', sort: 3 },
  { id: 'Runway', name: 'Runway', desc: '世界一致性强，角色/场景在多镜头中保持高度一致。适合精细打磨、追求品质的项目。', tag: '世界一致 · 精细打磨', sort: 4 },
  { id: 'Pika', name: 'Pika', desc: '竖屏短视频利器，视觉冲击力强，特效感突出。适合短视频平台内容创作。', tag: '竖屏 · 特效 · 视觉冲击', sort: 5 },
  { id: 'Gemini Omni', name: 'Gemini Omni', desc: '多模态混合输入（图/视频/音频），对话式编辑。适合已有素材、想通过对话反复修改的场景。', tag: '多模态 · 对话式编辑', sort: 6 }
]

// 模型推荐助手：7 层问题及选项（options 字段会 JSON.stringify 后存入 TEXT 列）
const RECOMMEND_QUESTIONS_SEED: Array<{
  layer: string; title: string; sort: number
  options: Array<{ label: string; models: string[]; note?: string }>
}> = [
  {
    layer: '第一层：核心用途',
    title: '你制作这个视频，最主要的目标是什么？',
    sort: 1,
    options: [
      { label: '讲一个故事，有角色、有对话、有情节推进', models: ['可灵'] },
      { label: '展示一个产品/服务，要快速、批量地产出', models: ['Seedance'] },
      { label: '做一条有电影感、艺术感的短片，追求画面质感', models: ['Veo', 'Runway'] },
      { label: '做竖屏短视频，要视觉冲击力、特效感强', models: ['Pika'] },
      { label: '手头有现成素材（图/视频），想通过对话反复改', models: ['Gemini Omni'] }
    ]
  },
  {
    layer: '第二层：角色一致性',
    title: '视频里是否会出现同一个角色/产品，并且需要在多个镜头里保持一致？',
    sort: 2,
    options: [
      { label: '是，角色/产品必须在不同场景里看起来完全一样', models: ['Runway', '可灵'] },
      { label: '是，但只需要大致像，不要求像素级一致', models: ['可灵', 'Seedance'] },
      { label: '不需要，每个镜头可以不一样', models: [] }
    ]
  },
  {
    layer: '第三层：镜头控制',
    title: '你对镜头运动（推拉摇移、光影变化）的控制要求有多高？',
    sort: 3,
    options: [
      { label: '很高，我需要精确指定镜头怎么动、光怎么打', models: ['Veo'] },
      { label: '中等，我描述大概感觉就行，模型自己发挥', models: ['可灵', 'Seedance'] },
      { label: '不高，我主要靠后期剪辑，生成片段能用就行', models: ['Pika', 'Seedance'] }
    ]
  },
  {
    layer: '第四层：效率 vs 精细打磨',
    title: '你更看重「快速出多个版本挑一个」，还是「反复调整打磨一个精品」？',
    sort: 4,
    options: [
      { label: '快速出多个版本，效率优先', models: ['Seedance', 'Pika'] },
      { label: '反复调整，精细打磨，时间不是问题', models: ['可灵', 'Veo', 'Runway'] },
      { label: '先用快的出草稿，再用好的精修', models: ['Seedance', '可灵', 'Veo'], note: '组合推荐：Seedance 草稿 + 可灵/Veo 精修' }
    ]
  },
  {
    layer: '第五层：输入素材',
    title: '你手头已经有哪些素材？',
    sort: 5,
    options: [
      { label: '只有文字想法', models: [] },
      { label: '有参考图片，想基于图生成', models: ['Runway', '可灵', 'Pika'] },
      { label: '有现成视频/音频，想混合编辑', models: ['Gemini Omni'] },
      { label: '有产品图，想做成动态广告', models: ['Seedance', 'Pika'] }
    ]
  },
  {
    layer: '第六层：时长与叙事复杂度',
    title: '你需要的单条视频大概多长？',
    sort: 6,
    options: [
      { label: '几秒到十几秒，一个镜头就够', models: ['Pika', 'Seedance', 'Veo'] },
      { label: '30秒左右，需要几个镜头切换', models: ['Seedance', '可灵'] },
      { label: '1分钟以上，有完整叙事', models: ['可灵'], note: '可灵智能分镜能力强，或建议分段生成后剪辑' }
    ]
  },
  {
    layer: '第七层：音频需求',
    title: '视频是否需要原生对话、音效或配乐？',
    sort: 7,
    options: [
      { label: '需要角色对话，且口型/语音要同步', models: ['Veo', '可灵'] },
      { label: '只需要背景音乐/音效，后期加就行', models: [] },
      { label: '不需要音频', models: [] }
    ]
  }
]

// AI 助手「使用指南」问答（客户端侧栏「使用指南」展示，按 category 分组）
const GUIDE_QUESTIONS_SEED: Array<{
  category: string; question: string; answer: string; sort: number
}> = [
  {
    category: '快速上手',
    question: '如何安装并启动这款软件？',
    answer: '桌面端：在下载页选择对应平台安装包，Windows 双击 .exe 安装、macOS 拖拽 .dmg、Linux 赋予执行权限后运行 .AppImage。启动后客户端会自动连接后台服务（默认 http://localhost:4178）并拉取系统配置；未登录也可浏览资源库，登录后可同步个人配置。',
    sort: 1
  },
  {
    category: '快速上手',
    question: '首次使用需要配置 API Key 吗？',
    answer: '需要。要真正调用模型生成内容，需在「资源库」中找到对应供应商并填写你自己的 API Key。未配置 Key 时仍可浏览模型信息，但无法发起生成任务。',
    sort: 2
  },
  {
    category: 'API 密钥与配置',
    question: '在哪里填写 API Key？',
    answer: '打开「资源库」功能，找到对应供应商，点击填写密钥即可。未登录时密钥仅保存在本地；登录后可按当前账号同步到后台，其他用户无法查看你的密钥。',
    sort: 3
  },
  {
    category: 'API 密钥与配置',
    question: '如何添加自己的供应商或模型？',
    answer: '在「资源库」页点击「添加」，可新增自定义供应商或自定义模型。自定义资源仅保存在本地，不上传服务器，会与系统自带资源一起展示和搜索。',
    sort: 4
  },
  {
    category: '功能使用',
    question: '「模型推荐助手」是做什么的？怎么用？',
    answer: '点击主面板右上角的星标按钮即可打开，弹窗侧栏的「模型推荐」就是该功能。它会通过几个分层问题了解你的用途（叙事、角色一致性、镜头控制、效率等），最后用投票算法为你推荐最合适的视频模型。',
    sort: 5
  },
  {
    category: '功能使用',
    question: '视频生成支持哪些参数？',
    answer: '支持设置分辨率（720P / 1080P）、宽高比（16:9、9:16、1:1、4:3、3:4）、时长（2s–30s），以及自动匹配的优先级（清晰度 / 速度 / 价格优先）。',
    sort: 6
  },
  {
    category: '功能使用',
    question: '如何查看我生成过的任务记录？',
    answer: '每次生成都会写入后台任务记录（含生成模式、分辨率、时长、状态等）。登录后可在任务记录列表查看自己的历史任务。',
    sort: 7
  },
  {
    category: '常见问题',
    question: '提示「无法连接后台服务」怎么办？',
    answer: '一般是后台服务未启动或端口不对。请先在 server 目录执行 npm run dev 启动后端（默认端口 4178），再启动客户端。',
    sort: 8
  },
  {
    category: '常见问题',
    question: '自定义供应商 / 模型的数据存在哪里？会同步到服务器吗？',
    answer: '只保存在本地 localStorage（键名 stunning-fast-store，字段 customProviders / customModels），不会写入后台数据库。换设备请使用「导出 / 导入」功能迁移。',
    sort: 9
  },
  {
    category: '常见问题',
    question: '如何把自定义资源迁移到另一台设备？',
    answer: '在「资源库」页点击「导出」生成 JSON 文件，在新设备上点击「导入」选择该文件即可。同 id 的资源会被覆盖。',
    sort: 10
  },
  {
    category: '常见问题',
    question: '改了后台系统配置，但客户端没生效？',
    answer: '客户端在启动时拉取一次系统配置，重启客户端即可刷新；或重新进入对应功能页会读取已加载的配置。',
    sort: 11
  },
  {
    category: '常见问题',
    question: '管理后台打不开 / 提示「管理后台未构建」？',
    answer: '访问 /admin 提示未构建时，先在 server 目录执行 npm run admin:build 生成后台产物。默认管理员账号 admin / admin123，首次登录后请及时修改密码。',
    sort: 12
  }
]

async function tableEmpty(table: string): Promise<boolean> {
  const r = await query(`SELECT 1 FROM ${table} LIMIT 1`)
  return r.rowCount === 0
}

async function seedProvidersAndModels() {
  if (!(await tableEmpty('providers'))) return
  for (const p of PROVIDERS_SEED) {
    await query(
      `INSERT INTO providers (id, name, key_hint, url, api_base_url, protocol, submit_path, status_path, submit_path_i2v, status_path_i2v, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [p.id, p.name, p.keyHint, p.url, p.apiBaseUrl ?? '', p.protocol ?? '', p.submitPath ?? '', p.statusPath ?? '', p.submitPathI2v ?? '', p.statusPathI2v ?? '', p.sort]
    )
    for (const m of p.models) {
      await query(
        `INSERT INTO models (id, provider_id, name, type, description, supports_i2v, supports_first_last, supports_reference,
           resolution, speed, price, default_resolution, default_ratio, default_duration, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [
          m.id, p.id, m.name, m.type, m.desc,
          m.supportsI2V ?? false, m.supportsFirstLast ?? false, m.supportsReference ?? false,
          m.res, m.speed, m.price,
          m.type === 'video' && m.res > 0 ? (m.res >= 1080 ? '1080P' : '720P') : '',
          m.type === 'video' ? '16:9' : '',
          m.type === 'video' ? '5' : '',
          m.sort
        ]
      )
    }
  }
  console.log(`[seed] providers + models 已初始化（${PROVIDERS_SEED.length} 供应商）`)
}

/** 迁移：为已存在但缺少默认值的系统供应商写入默认值（幂等，不覆盖管理员已填写的字段）。 */
async function backfillApiBaseUrls() {
  const DEFAULTS: Record<string, {
    apiBaseUrl: string; protocol: string
    submitPath?: string; statusPath?: string
    submitPathI2v?: string; statusPathI2v?: string
  }> = {
    alibaba: {
      apiBaseUrl: 'https://dashscope.aliyuncs.com/api/v1',
      protocol: 'dashscope',
      submitPath: '/services/aigc/video-generation/video-synthesis',
      statusPath: '/tasks/{taskId}'
    },
    volcengine: {
      apiBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      protocol: 'ark',
      submitPath: '/contents/generations/tasks',
      statusPath: '/contents/generations/tasks/{taskId}'
    },
    kling: {
      apiBaseUrl: 'https://api-beijing.klingai.com/v1',
      protocol: 'kling',
      submitPath: '/videos/text2video',
      statusPath: '/videos/text2video/{taskId}',
      submitPathI2v: '/videos/image2video',
      statusPathI2v: '/videos/image2video/{taskId}'
    },
    minimax: {
      apiBaseUrl: 'https://api.minimaxi.com',
      protocol: 'minimax',
      submitPath: '/v1/video_generation',
      statusPath: '/v1/query/video_generation?task_id={taskId}'
    },
    zhipu: {
      apiBaseUrl: 'https://open.bigmodel.cn',
      protocol: 'zhipu',
      submitPath: '/api/paas/v4/videos/generations',
      statusPath: '/api/paas/v4/async-result/{taskId}'
    },
    runway: {
      apiBaseUrl: 'https://api.dev.runwayml.com',
      protocol: 'runway',
      submitPath: '/v1/text_to_video',
      statusPath: '/v1/tasks/{taskId}'
    },
    luma: {
      apiBaseUrl: 'https://api.lumalabs.ai/dream-machine/v1',
      protocol: 'luma',
      submitPath: '/generations',
      statusPath: '/generations/{taskId}'
    },
    openai: {
      apiBaseUrl: 'https://api.openai.com',
      protocol: 'openai',
      submitPath: '/v1/videos',
      statusPath: '/v1/videos/{taskId}'
    },
    pika: {
      apiBaseUrl: 'https://pika.pikaslabs.com/v1',
      protocol: 'pika',
      submitPath: '/v1/videos',
      statusPath: '/v1/videos/{taskId}'
    }
  }
  for (const [id, d] of Object.entries(DEFAULTS)) {
    await query(
      `UPDATE providers SET
         api_base_url = COALESCE(NULLIF(api_base_url, ''), ?),
         protocol = COALESCE(NULLIF(protocol, ''), ?),
         submit_path = COALESCE(NULLIF(submit_path, ''), ?),
         status_path = COALESCE(NULLIF(status_path, ''), ?),
         submit_path_i2v = COALESCE(NULLIF(submit_path_i2v, ''), ?),
         status_path_i2v = COALESCE(NULLIF(status_path_i2v, ''), ?)
       WHERE id = ?`,
      [d.apiBaseUrl, d.protocol, d.submitPath ?? '', d.statusPath ?? '', d.submitPathI2v ?? '', d.statusPathI2v ?? '', id]
    )
  }
}

/** 迁移：把内置供应商的密钥获取地址与模型文档地址补入数据库（空值才写入，后台可随时修改）。 */
async function backfillUrls() {
  const PROVIDER_KEY_URLS: Record<string, string> = {
    alibaba: 'https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key',
    volcengine: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    kling: 'https://klingai.com/dev/api-key',
    minimax: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    runway: 'https://runwayml.com/settings/api',
    pika: 'https://pika.art/profile',
    luma: 'https://lumalabs.ai/api',
    zhipu: 'https://open.bigmodel.cn/usercenter/apikeys',
    openai: 'https://platform.openai.com/api-keys'
  }
  for (const [id, url] of Object.entries(PROVIDER_KEY_URLS)) {
    await query(
      `UPDATE providers SET api_key_url = ? WHERE id = ? AND (api_key_url = '' OR api_key_url IS NULL)`,
      [url, id]
    )
  }

  const MODEL_DOCS: Record<string, string> = {
    'wan2.7-t2v': 'https://help.aliyun.com/zh/model-studio/wan2.7-video-generation',
    'wan2.7-t2v-2026-06-12': 'https://help.aliyun.com/zh/model-studio/wan2.7-video-generation',
    'wan2.6-t2v': 'https://help.aliyun.com/zh/model-studio/wan2.6-video-generation',
    'wan2.2-t2v-plus': 'https://help.aliyun.com/zh/model-studio/wan2.2-video-generation',
    'wan2.1-t2v-turbo': 'https://help.aliyun.com/zh/model-studio/wan2.1-video-generation',
    'wan2.1-t2v-plus': 'https://help.aliyun.com/zh/model-studio/wan2.1-video-generation',
    'qwen-max': 'https://help.aliyun.com/zh/model-studio/getting-started/models',
    'doubao-seedance-2-5': 'https://www.volcengine.com/docs/82379/1521657',
    'doubao-seedance-2-0-260128': 'https://www.volcengine.com/docs/82379/1521657',
    'doubao-seedance-2-0-fast-260128': 'https://www.volcengine.com/docs/82379/1521657',
    'doubao-seedance-1-5-pro-251215': 'https://www.volcengine.com/docs/82379/1399079',
    'doubao-seedance-1-0-pro-fast-251015': 'https://www.volcengine.com/docs/82379/1339149',
    'doubao-pro': 'https://www.volcengine.com/docs/82379/1263482',
    'kling-v3': 'https://docs.qingque.cn/d/home/eZQB2yTMbVOeS6Ouk0tIBZbCG',
    'kling-v2-master': 'https://docs.qingque.cn/d/home/eZQB2yTMbVOeS6Ouk0tIBZbCG',
    'kling-v2-5-turbo': 'https://docs.qingque.cn/d/home/eZQB2yTMbVOeS6Ouk0tIBZbCG',
    'kling-v1-6': 'https://docs.qingque.cn/d/home/eZQB2yTMbVOeS6Ouk0tIBZbCG',
    'video-01': 'https://platform.minimaxi.com/document/Video%20Generation',
    'abab6-5': 'https://platform.minimaxi.com/document/Text%20Generation',
    'gen-3-alpha': 'https://docs.runwayml.com/',
    'pika-1-5': 'https://pika.art/faq',
    'dream-machine': 'https://docs.lumalabs.ai/docs/api',
    'cogvideox': 'https://open.bigmodel.cn/dev/api/video-generation',
    'glm-4': 'https://open.bigmodel.cn/dev/api/normal-model/glm-4',
    'sora-2': 'https://platform.openai.com/docs/guides/video',
    'dall-e-3': 'https://platform.openai.com/docs/guides/image-generation',
    'gpt-4o': 'https://platform.openai.com/docs/models/gpt-4o'
  }
  for (const [id, url] of Object.entries(MODEL_DOCS)) {
    await query(
      `UPDATE models SET docs_url = ? WHERE id = ? AND (docs_url = '' OR docs_url IS NULL)`,
      [url, id]
    )
  }
}

/** 迁移：老库模型缺少默认生成参数时补入（空值才写入，不覆盖管理员配置）。 */
async function backfillModelDefaults() {
  await query(
    `UPDATE models SET
       default_resolution = CASE WHEN resolution >= 1080 THEN '1080P' ELSE '720P' END
     WHERE type = 'video' AND resolution > 0
       AND (default_resolution = '' OR default_resolution IS NULL)`
  )
  await query(
    `UPDATE models SET default_ratio = '16:9'
     WHERE type = 'video' AND (default_ratio = '' OR default_ratio IS NULL)`
  )
  await query(
    `UPDATE models SET default_duration = '5'
     WHERE type = 'video' AND (default_duration = '' OR default_duration IS NULL)`
  )
}

/**
 * 迁移（一次性）：老库的系统模型能力字段曾被客户端硬编码覆盖，数据库里 first_last/reference 仍是默认 false。
 * 这里把原内置能力补写进数据库。通过 meta 表标记确保只执行一次，之后管理员的修改不会被覆盖。
 */
async function backfillModelCapabilities() {
  const done = await queryOne(`SELECT 1 FROM meta WHERE \`key\` = 'cap_backfill_v1'`)
  if (done) return
  const CAP: Record<string, { firstLast: boolean; reference: boolean }> = {
    'doubao-seedance-2-5': { firstLast: true, reference: true },
    'doubao-seedance-2-0-260128': { firstLast: true, reference: true },
    'doubao-seedance-2-0-fast-260128': { firstLast: true, reference: true },
    'doubao-seedance-1-5-pro-251215': { firstLast: true, reference: true },
    'doubao-seedance-1-0-pro-fast-251015': { firstLast: false, reference: true },
    'kling-v3': { firstLast: true, reference: true },
    'kling-v2-master': { firstLast: true, reference: true },
    'kling-v2-5-turbo': { firstLast: true, reference: true },
    'kling-v1-6': { firstLast: true, reference: true },
    'gen-3-alpha': { firstLast: true, reference: true },
    'pika-1-5': { firstLast: false, reference: true },
    'dream-machine': { firstLast: false, reference: true }
  }
  for (const [id, c] of Object.entries(CAP)) {
    await query(
      `UPDATE models SET supports_first_last = ?, supports_reference = ?
       WHERE id = ? AND supports_i2v = TRUE`,
      [c.firstLast, c.reference, id]
    )
  }
  await query(`INSERT INTO meta (\`key\`, \`value\`) VALUES ('cap_backfill_v1', NOW())`)
  console.log('[seed] 模型能力字段已一次性回填')
}

async function seedFeatures() {
  if (!(await tableEmpty('features'))) return
  for (const f of FEATURES_SEED) {
    await query(
      `INSERT INTO features (id, name, icon, description, pinned, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [f.id, f.name, f.icon, f.desc, f.pinned, f.sort]
    )
  }
  console.log(`[seed] features 已初始化（${FEATURES_SEED.length} 功能入口）`)
}

async function seedVideoConfig() {
  if (!(await tableEmpty('video_config_options'))) return
  for (const o of VIDEO_CONFIG_SEED) {
    await query(
      `INSERT INTO video_config_options (config_key, option_value, option_label, sort_order, is_active)
       VALUES (?, ?, ?, ?, TRUE)`,
      [o.key, o.value, o.label, o.sort]
    )
  }
  console.log(`[seed] video_config_options 已初始化（${VIDEO_CONFIG_SEED.length} 项）`)
}

async function seedRecommendModels() {
  if (!(await tableEmpty('recommend_models'))) return
  for (const m of RECOMMEND_MODELS_SEED) {
    await query(
      `INSERT INTO recommend_models (id, name, description, tag, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, TRUE)`,
      [m.id, m.name, m.desc, m.tag, m.sort]
    )
  }
  console.log(`[seed] recommend_models 已初始化（${RECOMMEND_MODELS_SEED.length} 个模型）`)
}

async function seedRecommendQuestions() {
  if (!(await tableEmpty('recommend_questions'))) return
  for (const q of RECOMMEND_QUESTIONS_SEED) {
    await query(
      `INSERT INTO recommend_questions (layer, title, options, sort_order, is_active)
       VALUES (?, ?, ?, ?, TRUE)`,
      [q.layer, q.title, JSON.stringify(q.options), q.sort]
    )
  }
  console.log(`[seed] recommend_questions 已初始化（${RECOMMEND_QUESTIONS_SEED.length} 个问题）`)
}

async function seedGuideQuestions() {
  if (!(await tableEmpty('guide_questions'))) return
  for (const q of GUIDE_QUESTIONS_SEED) {
    await query(
      `INSERT INTO guide_questions (category, question, answer, sort_order, is_active)
       VALUES (?, ?, ?, ?, TRUE)`,
      [q.category, q.question, q.answer, q.sort]
    )
  }
  console.log(`[seed] guide_questions 已初始化（${GUIDE_QUESTIONS_SEED.length} 条问答）`)
}

async function seedAdminUser() {
  // 管理员按 username 唯一判断，已存在则跳过
  const exists = await queryOne('SELECT 1 FROM users WHERE username = ?', [config.adminUsername])
  if (exists) return
  const hash = await hashPassword(config.adminPassword)
  await query(
    `INSERT INTO users (username, password_hash, role, is_active)
     VALUES (?, ?, 'admin', TRUE)`,
    [config.adminUsername, hash]
  )
  console.log(`[seed] 管理员账号已创建：${config.adminUsername} / ${config.adminPassword}（请及时修改密码）`)
}

/** 启动时执行：仅在各表为空时插入种子数据，不覆盖已有数据。 */
export async function seedAll(): Promise<void> {
  await seedProvidersAndModels()
  await seedFeatures()
  await seedVideoConfig()
  await seedAdminUser()
  await seedRecommendModels()
  await seedRecommendQuestions()
  await seedGuideQuestions()
  // 为已存在的系统供应商补入接口地址/协议/路径默认值，并为模型补入默认参数与能力（幂等）
  await backfillApiBaseUrls()
  await backfillUrls()
  await backfillModelDefaults()
  await backfillModelCapabilities()
}