# 绝色 · AI 视频工具导购模式 —— 产品重构与移动端适配方案

> 项目：`e:\projects\stunning-fast`（Electron 31 + React 18 + Vite + Express/MySQL）
> 日期：2026-11-13
> 定位转变：**从「AI 视频生成客户端」转为「AI 视频工具导购 + API 配置引导 + 可选的一站式生成」**。本轮不再以生成能力为产品主线。
> 参考数据：2026 年第四季度主流榜单（BigBangIndex / Toybox AI / GeekChamp）。OpenAI Sora 已于 2026 年 4 月 26 日关停，API 计划 9 月 24 日停服。

---

## 0. 决策摘要（给需要快速决策的读者）

| 维度 | 结论 |
| --- | --- |
| 产品定位 | **新手向 AI 视频工具导购 + API 配置引导**；生成能力保留为"可选的一站式体验"（通过"已配置密钥的工具可直接在 App 内尝试"链接到 `VideoGeneration` 页） |
| 资源库 | **主功能，全面重做**：从"生成协议管理"改为"工具目录"；字段从 9 个扩到 20+；从 9 家扩到 30–40 家 |
| VideoGeneration | **降级为辅助功能页**（改名"快速体验"或"已配置工具"），入口藏在资源库的"已配置"tab 里 |
| 后端 schema | **新增 `tools` / `tool_categories` / `tool_scenarios` 三张表**，保留 providers/models 但仅作为"有 API 协议的工具"子集；`recommend_models` / `recommend_questions` 改造成导购问答引擎，**复用率最高** |
| 移动端适配 | **难度骤降**：不需要后端任务化、不需要对象存储、不需要视频归档；Capacitor 包壳 + HTTPS + 响应式布局即可上线；资源库卡片网格、导购问答、配置引导都是天然移动端友好的交互 |
| 桌面端改动 | `ResourceLibrary` 组件大改；`VideoGeneration` 降级；新增首页"导购问答入口" |
| 第一步 | 后端新增 tools 表 + 种子数据（本章附录 A 的 30 家工具）+ 前端新首页占位 + 导购问答接线——**一周可见 MVP** |

---

## 1. 为什么导购模式更适合现状

### 1.1 当前资源库 vs 导购资源库

| 维度 | 当前 ResourceLibrary.tsx | 导购版资源库 |
| --- | --- | --- |
| **服务对象** | 开发者/有经验的用户 | 新手/没接触过 AI 视频的用户 |
| **展示目标** | "我有哪些已接入协议的供应商/模型" | "根据你的需求，选哪个工具最合适" |
| **列表数量** | 9 家系统供应商（dashscope/ark/kling/minimax/zhipu/runway/luma/openai/pika）+ 用户自定义 | 30–40 家主流工具，按类别/场景/定价/难度筛选 |
| **必填字段** | 自定义供应商必须填：API Base URL、协议类型、提交/查询路径、Key 提示 | 不需要这些；只需要：官网、定价、是否需要 API Key、适合场景、亮点、难度、截图 |
| **"自定义"的含义** | 自己接入一个符合协议的新供应商 | 收藏/标记/写笔记 |
| **卡片信息** | 模型名 + 供应商 + 简述 + "获取 API Key / 了解详情"按钮 | 工具 Logo + 类别 Tag + 定价 + 难度 + 是否免费 + 是否有 API + 30 秒简介 + 主亮点 + "去官网" / "如何配置 Key" 引导 |
| **新增 Tab** | 搜索 + 类型筛选 | 场景推荐问答（已有 recommend_questions 表！）+ 筛选器（免费/有 API/新手友好）+ 最近热门 + 已收藏 |
| **核心 CTA** | "添加自定义供应商/模型" | "试试这个 →"（跳转官网 / "如何拿到 API Key" 引导页） |

### 1.2 后端 schema 的复用与新增

**能复用的（远多于视频生成模式）**：

- `recommend_models` / `recommend_questions` 表：这两张表天生就是导购问答引擎——现在只用于"推荐助手 Modal"，但扩展成导购主入口非常自然。把场景（"我想做短视频口播视频"、"我想给自己的照片做动效"、"完全小白不想装 GPU"）映射到工具推荐，`options` 字段直接塞候选工具列表 + 理由。
- `bootstrap` 接口：继续做"配置聚合下发"，这次聚合 tools 而不是 providers/models。
- `user_configs` 表：用来存用户收藏的工具、偏好的场景分类。
- `user_api_keys` 表：继续存已配置的 Key，但增加 `provider_id → tool_id` 的映射。

**需要新增的**：

1. `tools`（核心目录表）
2. `tool_categories`（类别：文生视频、图生视频、运镜/口型、AI 头像/播报、本地开源、视频编辑/模板）
3. `tool_scenarios`（场景标签：口播产品介绍、短视频 Shorts、动漫/风格化、电影级写实、人物动作/角色一致、3D 产品展示、老照片复活、语音转视频等）

**可以废弃或降级的**：

- `protocols/` / `video.ts`：视频生成的 9 个协议**保留但降级**为"已配置工具可以一站式尝试"的能力，不再作为主功能。
- `tasks` / `video_config_options` / `models` / `features` 表：保留作为数据库兼容迁移，但新导购模式主数据流不经过它们。

### 1.3 为什么导购让移动端适配变简单

前一份方案的三大致命障碍（视频生成编排、后端任务化、对象存储 + 视频归档）**在导购模式下全部消失**：

| 旧障碍 | 导购模式下的状态 |
| --- | --- |
| 视频生成 10 分钟轮询 / Node crypto 签 JWT / base64 | ✅ 不需要了。用户在 App 内拿到 API Key 引导，自己到对应官网或 App 生成 |
| 后端任务表 / 任务队列 / BullMQ + Redis | ✅ 不需要了。导购不做后台调度 |
| 对象存储 / 视频归档 / CDN | ✅ 不需要了。推荐素材用外部截图 URL，不存本地也不存自有 OSS |
| HTTPS | ⚠️ 仍然需要，但只是让前端能调 bootstrap 接口，不是因为有敏感任务数据 |
| 鉴权 + refresh token | ⚠️ 需要但复杂度降低：Key 配置向导需要登录、收藏/历史需要登录；不需要任务级权限 |

移动端适配的核心难点从"视频生成服务化"降级为"**响应式卡片网格 + 导购问答页 + 配置引导 Modal**"——这三件事 Capacitor/WebView 天然擅长。

---

## 2. 新资源库（工具目录）数据模型

### 2.1 表设计

```sql
CREATE TABLE IF NOT EXISTS tools (
  id              VARCHAR(64)  NOT NULL,          -- 英文标识，如 kling / google-veo3 / runway / wan-2-2
  name            VARCHAR(128) NOT NULL,          -- 工具显示名，如 可灵 / Google Veo 3.1 / Runway
  subtitle        VARCHAR(128) NOT NULL DEFAULT '', -- 副标题，如 "快手出品，性价比首选"
  provider        VARCHAR(128) NOT NULL DEFAULT '', -- 厂商：快手 / Google / Runway / 阿里 / MiniMax / 字节 / Luma / Pika / 腾讯 / 开源社区 / HeyGen / Synthesia
  official_url    VARCHAR(256) NOT NULL DEFAULT '', -- 官网
  api_docs_url    VARCHAR(256) NOT NULL DEFAULT '', -- API 文档（无 API 的为空）
  api_key_url     VARCHAR(256) NOT NULL DEFAULT '', -- 申请 API Key 页面
  logo_url        VARCHAR(512) NOT NULL DEFAULT '', -- Logo/截图 URL（CDN 或自有）
  banner_url      VARCHAR(512) NOT NULL DEFAULT '', -- 封面横幅（详情页）

  -- 导购核心字段
  categories      VARCHAR(512) NOT NULL DEFAULT '', -- 逗号分隔：text-to-video,image-to-video,lip-sync,avatar,open-source,editing
  scenarios       VARCHAR(1024) NOT NULL DEFAULT '', -- 逗号分隔：shorts,talking-head,animation,cinematic,character-consistency,product-demo,photo-to-video,local-gpu
  difficulty      VARCHAR(16)  NOT NULL DEFAULT 'beginner', -- beginner / intermediate / advanced
  pricing_tier    VARCHAR(16)  NOT NULL DEFAULT 'free',     -- free / freemium / pay-per-use / subscription / premium-only
  starting_price  VARCHAR(64)  NOT NULL DEFAULT '',        -- "免费额度 50 条/天" / "$10/月起" / "$0.05/秒" / "开源免费"
  has_api         TINYINT(1)   NOT NULL DEFAULT 0,          -- 是否有公开 API
  has_web_app     TINYINT(1)   NOT NULL DEFAULT 1,          -- 是否有 Web 界面（新手可直接用）
  has_mobile_app  TINYINT(1)   NOT NULL DEFAULT 0,          -- 是否有 iOS/Android App
  has_open_source TINYINT(1)   NOT NULL DEFAULT 0,          -- 是否开源可本地跑
  synced_audio    TINYINT(1)   NOT NULL DEFAULT 0,          -- 是否原生支持音视频同步生成（2026 年核心区分点）

  max_resolution  VARCHAR(16)  NOT NULL DEFAULT '',         -- 如 "4K" / "1080p"
  max_clip_sec    INT          NOT NULL DEFAULT 0,          -- 单次生成最长秒数
  supports_i2v    TINYINT(1)   NOT NULL DEFAULT 0,          -- 支持图生视频
  supports_t2v    TINYINT(1)   NOT NULL DEFAULT 1,          -- 支持文生视频
  supports_reference TINYINT(1) NOT NULL DEFAULT 0,         -- 支持多参考图

  short_desc      VARCHAR(256) NOT NULL DEFAULT '',        -- 30 秒简介（卡片上显示）
  highlights      TEXT         NOT NULL,                    -- 主亮点列表 JSON：["音质与画面同步生成","支持 4K","商业授权包含在付费档"]
  limitations     TEXT         NOT NULL,                    -- 主要限制 JSON：["免费档输出不能商用","无 API 免费层"]
  setup_steps     TEXT         NOT NULL,                    -- 如何上手/如何申请 Key 的分步引导 Markdown
  notes           TEXT         NOT NULL,                    -- 备注/变更记录（如 Sora 已停）

  -- 聚合评分（可选，从外部榜单刷入）
  artificial_analysis_score INT NOT NULL DEFAULT 0,          -- Artificial Analysis Elo 分数（盲评）
  sort_order      INT          NOT NULL DEFAULT 0,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tool_favorites (
  user_id  INT         NOT NULL,
  tool_id  VARCHAR(64) NOT NULL,
  note     VARCHAR(512) NOT NULL DEFAULT '',
  created_at DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, tool_id),
  CONSTRAINT fk_tf_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> 说明：categories / scenarios 用逗号分隔字符串，避免多对多中间表（当前规模 <50 家，全量下发 + 内存筛选足够）。若后续扩到 100+ 家或有复杂筛选，再改成关系表。

### 2.2 类别定义（categories）

| 值 | 说明 |
| --- | --- |
| text-to-video | 文生视频 |
| image-to-video | 图生视频 |
| lip-sync | 口型同步 |
| avatar | AI 头像/数字人口播 |
| open-source | 开源可本地运行 |
| editing | 视频编辑/模板驱动 |
| multi-reference | 多参考图/多镜头合成 |

### 2.3 场景标签（scenarios，首批）

`shorts`（短视频）/ `talking-head`（口播视频）/ `animation`（动漫/风格化）/ `cinematic`（电影级写实）/ `character-consistency`（人物/角色一致）/ `product-demo`（3D 产品展示）/ `photo-to-video`（老照片/静态图片动效）/ `local-gpu`（本地 GPU 跑）/ `multilingual-audio`（多语言语音）/ `cheap`（便宜/性价比）/ `free`（免费）

---

## 3. 首批 30 家 AI 视频工具清单（2026 Q4 权威榜单交叉确认）

### 3.1 文生/图生视频（主流生成型）

| 工具 | 最新模型 | 最高分辨率 | 同步音视频 | 免费层 | 起步付费 | 有 API | 有 Web | 有 App | 有开源 | 适合 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Google Veo 3.1** | Veo 3.1 Standard/Fast/Lite | 4K | ✅ | Flow 每天 50 积分（API 无免费） | Lite $0.05/秒 | ✅ | ✅ | ✅ | ❌ | 综合最佳，原生音视频 |
| **Gemini Omni Flash** | Gemini Omni | - | ✅ | Gemini app 消费档 | $4.99/月 | ✅ | ✅ | ✅ | ❌ | 聊天式生成 |
| **Kling（可灵 3.0）** | Video 3.0 / 2.6 | 4K | ✅ | Basic 免费但非商用 | $8.80/月起 | ✅ | ✅ | ✅ | ❌ | 性价比之王，中文语音 |
| **Runway Gen-4.5** | Gen-4.5 + 聚合 Veo/Kling | 4K upscale | 需捆绑 | 125 次一次性 | $12/月起 | ✅ | ✅ | ❌ | ❌ | 专业工作区 + 多模型 |
| **Dreamina（Seedance 2.0）** | Seedance 2.0 / 2.5 | 4K | ✅ | 每日免费积分 | $15/月起 | ❌ | ✅ | ✅ | ❌ | 多参考图合成，剪映生态 |
| **MiniMax Hailuo H3** | H3 Max | 2K | ❌ | Web 有免费层 | API $0.07/秒 | ✅ | ✅ | ❌ | ❌ | 物理运动真实感，便宜 |
| **Luma Dream Machine (Ray3)** | Ray3 line | 1080p + HDR | ❌ | 有，带水印 | ~$8/月 | ✅ | ✅ | ❌ | ❌ | HDR + 电影感运动 |
| **Pika** | 最新 Pika | 1080p | 音效 | 注册赠积分 | ~$8/月 | ✅ | ✅ | ❌ | ❌ | 社交短视频快速生成 |
| **ByteDance Seedance** | Seedance 2.0 | 1080p | ✅ | 有限试用 | 不定 | ❌ | ✅ | ✅ | ❌ | 多参考输入最丰富 |
| **OpenAI Sora** | — | — | — | — | — | **已停服 9/24** | ❌ | ❌ | ❌ | **备注：已关停，全部引导到 Veo 3.1** |

### 3.2 开源可本地跑（免费 + 无供应商锁定）

| 工具 | 模型 | 最高分辨率 | 同步音视频 | GPU 需求 | 备注 |
| --- | --- | --- | --- | --- | --- |
| **Wan 2.2（阿里）** | Wan 2.2 | 1080p+ | ❌ | 24GB 显存（RTX 4090） | Apache 2.0 开源，人像最真实，视频/图像/编辑一身 |
| **Wan 3.0（阿里）** | Wan 3.0 | — | ❌ | 更高 | 盲评排名第二 |
| **LTX-2（Lightricks）** | LTX-2 | 4K | ✅ | 较高 | 开源首个音视频同步生成 |
| **HunyuanVideo 1.5（腾讯）** | HunyuanVideo 1.5 | 1080p | ❌ | 单 RTX 4090 即可 | 最佳 VRAM 效率 |
| **HunyuanVideo 1.5 Pro** | Pro | — | ❌ | — | 更大更精准 |
| **MiniMax H3（开源权重）** | H3 / H3 Max | 2K | ❌ | — | Hugging Face 可下载 |

### 3.3 AI 头像/口播（非传统文生视频，但用户常混淆）

| 工具 | 特点 | 起步付费 | 适合 |
| --- | --- | --- | --- |
| **HeyGen** | 数字人播报、换脸、视频翻译 | 免费 1 条/月；$29/月起 | 培训视频、本地化 |
| **Synthesia** | 类似 HeyGen，100+ 语言 | $29/月起 | 企业级 |
| **D-ID** | 让照片说话 / 头像视频 | 免费版有水印 | 静态照片动效 |
| **SadTalker（开源）** | 开源口型同步 | 免费本地跑 | 开发者/爱好者 |

### 3.4 视频编辑/模板驱动（AI 辅助）

| 工具 | 特点 | 起步付费 | 适合 |
| --- | --- | --- | --- |
| **InVideo AI** | 脚本到视频，AI 自动剪配模板 | 免费 10 条/月；$25/月起 | 大批量内容生产 |
| **Descript** | "编辑文字 = 编辑视频" | 免费；$12/月起 | 播客/采访/字幕 |
| **Opus Clip** | 长视频 → 多条 Shorts | $19/月起 | 视频号/抖音/YouTube Shorts |
| **CapCut** | AI 辅助模板 + 剪映生态 | 免费 | 国内短视频用户 |

### 3.5 Midjourney Video

| 工具 | 特点 | 起步付费 | 适合 |
| --- | --- | --- | --- |
| **Midjourney Video** | 把你在 Midjourney 生成的图变成 5 秒视频 | Basic 订阅（年费 20% off） | 已有 Midjourney 订阅的用户 |

---

## 4. 新导购模式前端界面方案（桌面 + 移动同构）

### 4.1 首页：导购问答入口（全新）

```
┌─────────────────────────────────────────────────────┐
│  绝色 AI 视频助手                            [登录] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ✨ 你想做什么样的视频？                             │
│                                                     │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────┐ │
│  │ 🎙️ 口播视频 │ │ 🎬 电影质感 │ │ 📱 短视频 │ │  👶 │ │
│  │ 让 AI 代你说│ │ 写实 4K   │ │ Shorts  │ │ 入门 │ │
│  └───────────┘ └───────────┘ └───────────┘ └──────┘ │
│                                                     │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐         │
│  │ 🖼️ 图片动效 │ │ 🏠 本地跑  │ │ 💰 纯免费 │         │
│  │ 静态图变视频 │ │ 用自己 GPU │ │ 零成本   │         │
│  └───────────┘ └───────────┘ └───────────┘         │
│                                                     │
│  ▸ 继续回答问题帮你选：我想做的视频主要...           │
│                                                     │
├─────────────────────────────────────────────────────┤
│  🔥 本周热门                    [查看全部]          │
│  ┌─────────────────────────────────────────────────┐│
│  │ Kling 3.0 │ Google Veo 3.1 │ Runway Gen-4.5 │   ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

实现：

- 复用 `recommend_questions` 表（现有路由 `/api/recommend`），把场景回答 → 工具列表 + 简短推荐理由的逻辑从 Modal 搬到首页。
- 按场景筛选 tools 表中 `scenarios` 包含对应标签的工具。
- 热门排序：`artificial_analysis_score` 降序 + `sort_order`。

### 4.2 资源库（主页面，全面重做）

```
┌──────────────────────────────────────────────────────────┐
│  📚 工具库  [场景问答] [我的收藏]                         │
├──────────────────────────────────────────────────────────┤
│  [全部 ▾] [免费] [有 API] [新手友好] [开源本地跑] [4K]  │
├──────────────────────────────────────────────────────────┤
│  🔍 搜索工具名 / 场景关键字…                              │
├──────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐  ┌──────────────────────┐     │
│  │ [Logo] Google Veo 3.1 │  │ [Logo] Kling 3.0      │     │
│  │ 综合最佳 · 原生音视频 │  │ 性价比 · 中文语音     │     │
│  │                       │  │                       │     │
│  │ 💰 $0.05/秒起         │  │ 💰 $8.80/月起         │     │
│  │ 🎚️ 新手  ⚡ 4K  🎙️ 同步│  │ 🎚️ 新手  🔓 免费层    │     │
│  │ ✅ 有 API ✅ Web ✅ App│  │ ✅ 有 API ✅ Web ✅ App│     │
│  │                       │  │                       │     │
│  │ [去官网] [如何拿 Key] │  │ [去官网] [如何拿 Key] │     │
│  └──────────────────────┘  └──────────────────────┘     │
│  ┌──────────────────────┐  ┌──────────────────────┐     │
│  │ Runway Gen-4.5        │  │ Wan 2.2（开源）       │     │
│  │ 专业工作区 + 多模型   │  │ 本地免费 + 人像最佳   │     │
│  │ $12/月起              │  │ 💚 完全免费           │     │
│  │ ⚡ 聚合 3+ 模型       │  │ 🔓 需 RTX 4090       │     │
│  │ [去官网] [如何拿 Key] │  │ [GitHub] [ComfyUI 教程]│     │
│  └──────────────────────┘  └──────────────────────┘     │
└──────────────────────────────────────────────────────────┘
```

实现：

- 卡片网格替代当前 ModelCard。每卡 6–8 行：Logo + 标题 + 副标题 → 定价 + 难度 → Tag 行（是否有 API/Web/App/开源）→ 2 个 CTA 按钮。
- 筛选器：categories 多选 + pricing_tier + has_api + has_open_source + difficulty + synced_audio（同步音视频 2026 核心区分点）。
- 点击卡片 → 详情页（新窗口或右侧抽屉）：大 Banner + 完整简介 + 亮点/限制 + 定价详情 + 支持的生成方式 + **分步配置引导（setup_steps Markdown 渲染）** + 外链。
- 收藏：用 `tool_favorites` 表，"我的收藏" Tab 显示。
- 自定义供应商/模型按钮**保留但藏起来**——只对已登录且需要的开发者显示（`SettingsModal` 里加"开发者模式"开关）。

### 4.3 配置引导（核心新能力）

点击卡片"如何拿 Key"或"配置向导"按钮：

```
┌─────────────────────────────────────────┐
│  🔑 配置 Kling API Key                    │
├─────────────────────────────────────────┤
│ Step 1: 打开可灵开放平台                 │
│   点击 → https://platform.kling.ai      │
│   注册/登录（手机号或邮箱）               │
│                                          │
│ Step 2: 在控制台创建 API Key              │
│   左侧菜单 → API 密钥管理 → 创建         │
│   复制 Key（只会显示一次，别忘了！）      │
│                                          │
│ Step 3: 回到绝色 App 粘贴                 │
│   [输入框 sk-xxxxxxxxxxxxx]              │
│                                          │
│ Step 4: 完成！现在可以在"快速体验"里试试了 │
│   [去试试 →]                              │
└─────────────────────────────────────────┘
```

实现：

- `tools.setup_steps` 字段存 Markdown，前端用 react-markdown + 安全链接渲染。
- 保存 Key 逻辑沿用现有 `user_api_keys` 表（有 provider_id → tool_id 的映射）。
- "快速体验"页入口：只列出已配置 Key 的工具（从 tools 表 JOIN user_api_keys 过滤），然后**降级**调用 `electron/video.ts` 的协议生成——不是主功能，但"既然用户配了 Key，顺手能试一下"就是非常好的转化闭环。

### 4.4 移动端适配难度骤降的原因

当前资源库组件（`ResourceLibrary.tsx`）是 1026 行的巨型组件，但拆分后移动端天然友好：

| 组件 | 桌面端 | 移动端 |
| --- | --- | --- |
| 首页 | 左侧导航 + 右侧问答 + 热门 | 全屏滚动，底部 Tab：首页 / 资源库 / 我的 |
| 资源库 | 2 列网格（450px 宽面板） | 1 列卡片 + 顶部横向滚动筛选器（Pills） |
| 详情页 | 右侧抽屉 500px | 全屏页面，顶部 Banner + 标签 + 亮点 + 限制 + 配置引导 |
| 配置引导 | Modal 480px | 全屏页面，步骤指示器 + 大按钮 |
| 设置 | Modal | 页面内 Fragment |
| 快速体验（原 VideoGeneration） | 双栏 + 拖拽分隔条 | 合并成单页：表单在上 → 生成按钮 → 进度/预览在下 |

技术栈变化：**无**。Capacitor 直接承载现有 React + Tailwind 代码；响应式用 `sm:`/`md:`/`lg:` 断点；底部 TabBar 用 `@capacitor/app` + CSS 实现或 `react-native` 风格的现有库。

---

## 5. 后端新增/改造

### 5.1 新增接口

| 方法 | 路径 | 说明 | 状态 |
| --- | --- | --- | --- |
| GET | `/api/tools` | 全量工具目录（支持 category/scenario/has_api/pricing/difficulty/synced_audio 过滤 + 搜索） | 新增 |
| GET | `/api/tools/:id` | 工具详情（含 setup_steps Markdown） | 新增 |
| GET | `/api/tools/recommend?scenario=xxx` | 按场景标签推荐（复用 recommend_questions 路由改造） | 复用 + 扩 |
| POST | `/api/user/favorites/:toolId` | 收藏 | 新增 |
| DELETE | `/api/user/favorites/:toolId` | 取消收藏 | 新增 |
| GET | `/api/user/favorites` | 我的收藏列表 | 新增 |
| POST | `/api/tools/feedback` | 用户提交新工具/工具信息纠错（便于全网持续补充） | 新增 |

### 5.2 改造接口

| 接口 | 改造 |
| --- | --- |
| `GET /api/bootstrap` | 聚合 tools / recommend_questions / （可选）providers/models |
| `GET /api/recommend` | 返回 tools 映射而不是 recommend_models |
| `GET /api/providers` / `/api/models` | **保留但降级**，仅用于 `SettingsModal` 里的开发者自定义 |
| `GET /api/tasks/mine` | 快速体验页的历史记录，继续用 |

### 5.3 种子数据（首批 30 家）

写一个 `server/src/db/seed-tools.ts`，启动时幂等 seed。每个工具的字段至少填：

- id / name / provider / official_url / logo_url
- categories / scenarios（首批 30 家按第 3 章手动分类）
- difficulty / pricing_tier / starting_price
- has_api / has_web_app / has_mobile_app / has_open_source / synced_audio
- max_resolution / max_clip_sec（如已知）
- short_desc / highlights / limitations
- setup_steps（Markdown，新手配置引导的核心价值）
- notes（如 Sora 已停）

### 5.4 "快速体验"的降级调用（可选）

如果用户配置了某工具的 Key，App 内允许一键生成：

- Desktop：继续用 `electron/video.ts`（现有协议），**不需要迁后端**——导购模式下生成不是主功能，能跑就行。
- Mobile（Capacitor）：后端新增 9 个协议的代理路由（`POST /api/generation/proxy/dashscope` 等），Capacitor App 通过后端代理调供应商（避免 WebView CORS）。Key 存在 `user_api_keys` 表里（加密）。这是**选择性迁移**，只为移动端打通快速体验，不影响桌面端。

### 5.5 HTTPS 仍然是第一优先级

导购模式下数据量小、无敏感任务，但**HTTPS 仍然是 iOS ATS / Android cleartext 的硬要求**，而且用户填写 API Key 的流程必须走 TLS。把 `.env.production` 的 `http://1.194.28.136:90` 改成 `https://api.<domain>` 是 P0 中唯一**不能延后**的项。

---

## 6. 全网持续补充工具的机制

"全网搜索更多 AI 工具"不能是一次性人工动作——这个品类每月都有新模型和新工具上线。需要一个持续刷新的流程：

### 6.1 用户驱动的补充

- **App 内 "这个工具不在列表里？提交一个 →" 按钮**：`POST /api/tools/feedback`，用户填工具名 + 网址 + 他用过的类别，管理员在后台审核后入库。
- **投票优先**：feedback 数 top N 的进入下次更新队列。

### 6.2 管理员后台手动维护

在现有 admin SPA（`server/admin/`）里加一页：

- 工具列表（可搜索/按类别筛选/状态切换）
- 新增/编辑工具表单（对应 20+ 字段）
- 批量导入（CSV/JSON）
- 审核 feedback 列表

### 6.3 外部榜单自动刷入（可选，后续）

- 定时拉取 Artificial Analysis 的 Video Arena Elo 分数（公开 API 或 HTML 解析），写入 `artificial_analysis_score` 字段，作为"本周热门"排序依据。
- 订阅 GeekChamp 的 weekly email / RSS，人工 review 新上榜工具后入库。
- WebFetch 定向爬取各大工具的 pricing 页面（跑在后端 cron job，每周一次，失败静默），避免定价字段过时。

### 6.4 内容版权注意

- 所有工具 Logo / 截图直接链到厂商 CDN（不要自己下载存 OSS），引用厂商公开页面 URL。
- 工具描述文案**自己写**（30 字 + 亮点列表），不要复制厂商官方描述——属于独立评测内容，更有导购价值。
- Sora 已停等重大变更必须及时在 `notes` 字段体现，并在首页/详情页明显位置标注。

---

## 7. 分阶段实施

### P0 · MVP（导购 + 资源库 + 配置引导，可独立交付）

1. **后端**：新建 `tools` / `tool_favorites` 表 + 6 个接口 + 30 家种子数据（第 3 章）+ HTTPS + 新增后台管理页
2. **前端资源库**：2 列卡片网格 + 筛选器 + 搜索 + 详情抽屉 + 收藏
3. **配置引导**：setup_steps Markdown 渲染 + API Key 表单 + 保存（复用现有 `user_api_keys`）
4. **首页**：导购问答入口（复用 `recommend_questions` 表 + tools 映射）
5. **VideoGeneration 降级**：从 FeatureTab 主菜单移入"快速体验" Tab，只列出已配置 Key 的工具
6. **桌面端回归**：原悬浮球/托盘/多窗口/electron-updater 保持不动

验收：App 打开 → 首页问答 → 进入资源库 → 筛选/搜索 → 卡片详情 → 配置引导 → 保存 Key →（可选）快速体验一键生成。

### P1 · 移动端包壳

1. **Vite 响应式改造**：资源库/首页/详情/配置引导页面补齐 `sm:`/`md:`/`lg:` 断点；底部 Tab 实现。
2. **Capacitor 工程**：生成 `android/` + `ios/`，配置 ATS、安全区、状态栏/键盘/相册插件。
3. **后端协议代理（仅移动端）**：为 9 个协议加简单代理路由，让 Capacitor 能"快速体验"。
4. **TestFlight / 蒲公英**：内测。

验收：iPhone Safari → Capacitor iOS TestFlight → Android APK 均可全流程。

### P2 · 体验与增长

1. **外部榜单自动刷分**：每周拉 Artificial Analysis Elo，热门排序自动更新。
2. **feedback 审核工作流**：App 内提交 → 管理员后台审核 → 自动入库。
3. **资源库 SEO**：官网 VitePress 站（`site/`）同步 tools 目录，生成静态页面被搜索引擎收录。
4. **站内分享**：把工具卡片分享到微信/朋友圈的海报模板。
5. **已配置工具的"一键生成"增强**：可选让后端承担生成（用户不暴露 Key），但这是**可选项**而非必经之路。

---

## 8. 与前一份"视频生成客户端 → 移动端"方案的对比

| 维度 | 上一份方案（生成为主） | 本方案（导购为主） | 变化 |
| --- | --- | --- | --- |
| 移动端核心障碍 | 视频生成 10 分钟轮询 / Node crypto / base64 内存炸弹 / CORS | 响应式卡片网格 + 导购问答页 | **三大障碍消失** |
| 后端改造量 | 新增 generation/tasks/queue/uploads 等 7+ 个模块 + Redis + 对象存储 + 鉴权 refresh | 新增 tools/favorites 表 + 6 个接口 + 后台管理页 | **-70%** |
| 桌面端改动量 | electron/video.ts 大段重构或双轨 | ResourceLibrary 大改 + VideoGeneration 降级 | 相当，但前者要回归生成、后者不需要 |
| 种子数据 | 9 个协议的 provider | 30 家工具（导购字段远多于协议字段，但不需要"能跑通 API"） | 数据量 +3x，但每条目工作量更低 |
| HTTPS | 必须 | 必须（优先级不降） | 不变 |
| 鉴权 refresh / 安全存储 | 必须 | 建议但可延后 | **复杂度降低** |
| 对象存储 / CDN | 必须（视频归档 + 封面） | 不需要 | **完全去掉** |
| BullMQ + Redis | 必须（任务队列） | 不需要 | **完全去掉** |
| 分阶段周期 | P0 8 周起（服务端任务化最重） | P0 2–3 周（导购 MVP） | **大幅缩短** |
| 产品闭环 | 配置 Key → 生成 → 播放 → 下载 → 分享 | 场景问答 → 选工具 → 引导配置 →（可选）快速体验 | 主链路更短、转化环节更少 |
| 差异化价值 | 竞品多：API Key 托管式 AI 视频生成客户端 | **非常稀缺**：面向新手的中文 AI 视频工具导购 + API 配置引导 | **明显增强** |

---

## 附录 A：核心文件索引（本轮新增/改造清单）

**需要修改的（现有文件）**

| 文件 | 改动 |
| --- | --- |
| `src/App.tsx` | 新增首页路由；VideoGeneration 移入"快速体验"Tab |
| `src/components/MainPanel.tsx` | FeatureTab 里"资源库"升到第一位；VideoGeneration 改名"快速体验" |
| `src/components/features/ResourceLibrary.tsx` | 全面重写（卡片网格 + 筛选器 + 详情抽屉 + 配置引导），当前 1026 行 |
| `src/components/features/VideoGeneration.tsx` | 降级：过滤未配置 Key 的工具；UI 简化（去掉拖拽分隔条） |
| `src/components/SettingsModal.tsx` | "开发者模式"开关控制自定义供应商/模型可见性 |
| `src/store/useStore.ts` | 新增 tools / favorites / filters 相关 state；customProviders/customModels 标记为 legacy |
| `src/types/index.ts` | 新增 Tool / ToolCategory / ToolScenario / Favorite 类型 |
| `src/api/client.ts` | 新增 `toolsApi` / `favoritesApi`；recommend 接口返回 tools 映射 |

**需要新增的**

| 文件 | 用途 |
| --- | --- |
| `server/src/db/seed-tools.ts` | 30 家工具种子数据 + seed 函数（幂等） |
| `server/src/modules/tools/route.ts` | `/api/tools` / `/api/tools/:id` / `/api/tools/recommend` |
| `server/src/modules/favorites/route.ts` | `/api/user/favorites/*` |
| `server/src/modules/tools/feedback.ts` | feedback 提交 |
| `server/src/db/schema.ts` | `ensureSchema()` 里追加 tools / tool_favorites 表 |
| `server/admin/src/components/Tools.tsx` | 后台工具管理页（参考现有 Users.tsx / Providers.tsx） |
| `src/components/ToolCard.tsx` | 新卡片组件 |
| `src/components/ToolDetail.tsx` | 详情抽屉/页面（Markdown 渲染 setup_steps） |
| `src/components/SetupWizard.tsx` | 配置引导 Modal |
| `src/platform/index.ts` | 平台适配层（桌面端 = window.api 包装；移动端 = Capacitor API） |

**需要废弃但保留的（legacy）**

| 目录/文件 | 状态 |
| --- | --- |
| `server/src/modules/providers/*` / `server/src/modules/models/*` | 降级：开发者自定义入口；bootstrap 仍聚合但可逐步迁移到 tools |
| `electron/video.ts` | 保留但标注 legacy；快速体验页仍可调用 |
| `electron/shared/ipc.ts` 中 `video:generate` / `video:progress` | 保留但仅桌面端快速体验用 |
| `server/src/modules/tasks/*` / `tasks` 表 | 保留（历史记录 + 统计）；VideoGeneration 页仍消费 |

---

## 附录 B：下一步建议

1. **要不要我先出 tools 表 + 30 家种子数据（SQL 或 seed-tools.ts）？** 这是后端 P0 的第一步，也是所有前端工作的前置依赖。你确认后我直接写。
2. **导购问答的场景清单要不要调整？** 第 4.1 节列了 7 个（口播/电影/短视频/图片动效/本地跑/纯免费/新手），你可以加/减。
3. **setup_steps（配置引导）的详细程度**：先给每家 2–3 个步骤 + 外链即可，还是要写完整的"从登录到创建 Key 到保存到 App"？前者快 5 倍，后者体验好。
4. **VideoGeneration 的命运**：P0 里要不要直接**隐藏**入口，只留资源库 + 导购 + 配置引导 + "去对应官网"按钮？还是保留"一键快速体验"（需要 desktop 用现有 video.ts + mobile 用后端代理）？

---

*本方案基于 2026 年 11 月榜单（BigBangIndex / Toybox AI / Artificial Analysis）编写。定价、模型版本、免费层额度持续变动，每季度更新 tools 表即可。*
