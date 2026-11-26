# 绝色 · AI 视频生成助手 —— 移动端适配分析与实施方案

> 分析对象：`e:\projects\stunning-fast`（Electron 31 + React 18 + Vite 5 + TypeScript + Express/MySQL）
> 分析范围：渲染层 `src/`、主进程 `electron/`、后端 `server/`、构建与发布链路
> 本文仅做分析与方案设计，不修改仓库现有代码。文中路径均为仓库相对路径。

---

## 0. 结论摘要

**推荐路径：先服务端任务化 + 移动端响应式 Web，再用 Capacitor 包壳上架（不重写 React Native）。**

三条不可绕过的先决条件（缺一条移动端都跑不通）：

1. **把视频生成从 Electron 主进程迁到后端**。当前 `electron/video.ts` 依赖"无 CORS 限制的 Node fetch + Node crypto 签 JWT + 最长 10 分钟进程内轮询 + Sora 视频转 base64"，这四点在有 CORS、会切后台、内存受限的手机 WebView 里都不成立。
2. **后端必须提供 HTTPS**。当前生产 API 是 `http://1.194.28.136:90`（见 `.env.production`），iOS ATS 默认拦截明文 HTTP，Android 9+ 默认禁止 cleartext traffic，App 会直接白屏/请求失败。
3. **素材改为"先上传拿 URL"**。当前图片/视频/音频以 data URL 直接内联进请求（`src/components/features/VideoGeneration.tsx`），手机相册原图动辄 5–10MB，内存和请求体都会被打爆。

在这三条完成后，现有 `src/` 约 90% 的业务代码（表单、模型选择、历史任务、资源库、推荐助手）可直接复用；桌面专有能力集中在 `electron/` 两个文件 + 49 处 `window.api` 调用点，用一个平台适配层即可隔离。

**不推荐 React Native 重写**：RN 无法复用现有 UI/状态代码，也救不了"生成必须服务端化"这部分工作，投入产出比最低。**不建议只做 H5/PWA 就收工**：iOS 侧安装率、后台能力、相册保存、推送都受限，无法形成完整产品闭环。

---

## 1. 现状架构

### 1.1 三端拓扑

```
┌──────────────────────────────┐        ┌───────────────────────────┐        ┌──────────────────┐
│  Electron 客户端 (Windows)    │        │  Express 后端 (Docker)     │        │  MySQL 8         │
│                              │        │                           │        │                  │
│  渲染层 src/ (React+Zustand) │──HTTP─▶│  /api/auth  /api/bootstrap │───────▶│  users/providers │
│        ▲                     │  JWT   │  /api/tasks /api/user/*    │        │  models/tasks    │
│        │ window.api (IPC)    │        │  /admin 管理后台 SPA       │        │  user_api_keys   │
│  主进程 electron/            │        └───────────────────────────┘        └──────────────────┘
│   - 窗口/托盘/自启/更新       │
│   - 视频生成 + 轮询  ─────────┼──────▶ 各视频供应商 API（DashScope / Ark / Kling / …）
└──────────────────────────────┘        （客户端直连，使用用户自己的 API Key）

发布链路：electron-builder → 天翼云 ZOS bucket-5620/release → electron-updater 检查更新
官网文档：VitePress (site/) → Nginx /docs/
```

关键事实：**应用服务器只负责账号、配置、任务记录；真正的视频生成请求由客户端主进程直接打给供应商，后端完全不参与、也不存储视频文件。**

### 1.2 渲染层 `src/`

| 维度 | 现状 | 证据文件 |
| --- | --- | --- |
| 入口/路由 | 无路由库，靠 `useState`/URL 参数 `?modal=update|recommendation` 切换：悬浮窗 / 主面板 / 弹窗 | `src/App.tsx` |
| 页面结构 | `FloatingWindow`（悬浮球）与 `MainPanel`（细长工具栏 450×100 + 功能页 1200×720）二选一；功能页内再切换 `VideoGeneration / ResourceLibrary / Customize / PlaceholderFeature` | `src/components/MainPanel.tsx` |
| 状态管理 | 单一 Zustand store + `persist`，持久化到 localStorage（key: `stunning-fast-store`）；布局、用户、密钥、自定义供应商/模型持久化；视频表单只在内存 | `src/store/useStore.ts` |
| 后端通信 | 手写 `fetch` 封装，统一 `{code,message,data}`；JWT 存 localStorage（`stunning-fast-token`）；API Base 由 `VITE_API_BASE_URL` 注入，可被 localStorage 覆盖 | `src/api/client.ts` |
| 类型 | 供应商/模型/推荐/功能等类型集中定义 | `src/types/index.ts` |
| 桌面耦合 | 49 处 `window.api` 调用，分布在 10 个文件 | 见下表 |

`window.api` 调用点分布（共 49 处）：

| 文件 | 次数 | 用途 |
| --- | --- | --- |
| `src/components/MainPanel.tsx` | 13 | 最小化/最大化/折叠/下拉扩展窗口/打开推荐窗口 |
| `src/store/useStore.ts` | 8 | 展开窗口、面板尺寸、恢复折叠状态 |
| `src/App.tsx` | 7 | 折叠/展开事件、弹窗尺寸、自动收起 |
| `src/components/FloatingWindow.tsx` | 5 | 拖拽移动窗口、右键菜单、保存位置 |
| `src/components/features/Customize.tsx` | 5 | 开机自启、置顶、面板尺寸 |
| `src/components/StandaloneUpdateModal.tsx` | 4 | 下载/安装更新、版本号 |
| `src/components/features/VideoGeneration.tsx` | 3 | 调用 `generateVideo`、监听生成进度 |
| `src/components/RecommendationAssistantModal.tsx` | 2 | 关闭独立推荐窗口 |
| `src/components/SettingsModal.tsx` | 1 | 外部浏览器打开官网 |
| `src/components/features/ResourceLibrary.tsx` | 1 | 外部浏览器打开文档链接 |

结论：**渲染层与 Node/Electron 的耦合面很窄但很集中**，且大部分是"窗口外形"而非业务逻辑——这正是可以用适配层隔离、复用 UI 代码的前提。

### 1.3 Electron 主进程 `electron/`

| 能力 | 实现位置 | 移动端是否存在 | 处置建议 |
| --- | --- | --- | --- |
| 无边框透明窗口 + 悬浮球 72×72 / 工具栏 450×100 / 功能页 1200×720 | `electron/main.ts` 顶部常量与 `createWindow` | ❌ | 全部丢弃，改为全屏 + 响应式布局 |
| 窗口拖拽、贴边 clamp、尺寸纠偏、位置记忆 | `electron/main.ts`（`onMove` / `resize` / electron-store `lastPos`） | ❌ | 删除 |
| 下拉框临时撑高窗口（`openDropdown` / `closeDropdown`） | `electron/main.ts` + `MainPanel.tsx` | ❌ | 改用页面内浮层/底部抽屉 |
| 托盘图标 + 右键菜单 | `electron/main.ts`（`Tray` / `Menu`） | ❌ | 删除 |
| 开机自启 | `auto-launch` | ⚠️ Android 需引导用户手动设置，iOS 不允许 | 删除该设置项 |
| 配置持久化 | `electron-store`（窗口位置/面板尺寸/自启开关） | ⚠️ | 改用 IndexedDB / Preferences |
| 外部浏览器打开链接 | `shell.openExternal` | ✅（换实现） | Capacitor Browser / `window.open` |
| 多窗口（更新弹窗 280×52、推荐助手 524×624） | `createUpdateWindow` / `createRecommendationWindow` | ❌ | 合并为 App 内页面或 Modal |
| 自动更新 | `electron-updater`（generic → ZOS） | ❌ | 应用商店更新 + 强制更新接口 |
| **视频生成编排** | `electron/video.ts`（9 种协议） | ❌（核心障碍） | 迁到后端 |
| 窗口最大/最小化、置顶 | `BrowserWindow` API | ❌ | 删除 |

`electron/video.ts` 的能力细节（迁移时必须逐条对齐）：

- 9 种协议：`dashscope` / `ark` / `kling` / `zhipu` / `minimax` / `runway` / `luma` / `openai` / `pika`，统一为"提交异步任务 → 每 5s 轮询 → 取视频 URL"，最长等待 10 分钟。
- 可灵使用 `crypto.createHmac('sha256')` 对 AK/SK 签 JWT（`signKlingJWT`），Web Crypto 虽能实现，但密钥暴露在手机端不可接受。
- OpenAI Sora 成功后需带鉴权再下载 `/content`，并把整个 mp4 转成 `data:video/mp4;base64,...` 返回渲染进程；手机端这是必然的内存炸弹。
- 所有请求使用 `fetch` 直连供应商，**没有 CORS 限制**——这是 Electron 主进程相对浏览器/WebView 的核心特权。

### 1.4 后端 `server/`

- 技术：Express 4 + MySQL（`mysql2`）+ JWT（`jsonwebtoken`）+ bcryptjs + nodemailer；无 Redis/队列/对象存储 SDK。
- 入口与中间件：`server/src/index.ts`、`server/src/routes/index.ts`、`server/src/middleware/auth.ts`、`server/src/utils/jwt.ts`。
- 现有接口：
  - 认证：`/api/auth/login`、`/api/auth/login-email`、`/api/auth/register`、`/api/auth/send-email-code`、`/api/auth/me`
  - 配置聚合：`/api/bootstrap`（供应商树 + 功能 + 视频参数 + 推荐/指南）
  - 管理端：`/api/providers`、`/api/models`、`/api/features`、`/api/video-config`、`/api/users`、`/api/system-config`
  - 用户私有：`/api/user/api-keys`、`/api/user/configs`
  - 任务记录：`/api/tasks`、`/api/tasks/mine`、`/api/tasks/mine/batch-delete` 等
  - 其他：`/api/feedback`、`/api/recommend`、`/api/guide`
- 鉴权：JWT 有效期 7 天（`JWT_EXPIRES_IN=7d`），无 refresh token、无设备管理、无登录限流。
- CORS：`CORS_ORIGIN=*`，并开启 `credentials: true`（`server/src/index.ts`）。
- 密钥存储：`user_api_keys.encrypted_key` 字段名为加密，但 `server/src/modules/userApiKeys/route.ts` 直接把请求中的明文 key 写入，**实际未加密**。
- 请求体上限：`express.json({ limit: '50mb' })`——为 base64 图片留的口子，移动端仍不够且很危险。
- 数据库：`server/src/db/schema.ts`，`tasks.image_url` 为 `LONGTEXT`（存 data URL），`tasks.video_url` 为 `TEXT`（存供应商 URL）。
- **没有**上传接口、没有对象存储、没有视频转码、没有任务队列、没有推送。

### 1.5 视频的产生 → 存储 → 播放链路

```
用户在 VideoGeneration 表单填 prompt / 选模型
        │  （参考图由 FileReader 转 data URL，仅存内存）
        ▼
window.api.generateVideo(params)  ← IPC
        ▼
electron/video.ts  按 protocol 路由
        │  提交任务（携带用户原始 apiKey）
        │  5s 轮询，最长 10min，通过 video:progress 回推
        ▼
供应商返回 video_url
        ▼
渲染进程 <video src={video_url}> 直接播放；"下载"实为 <a href target="_blank">
        │
        └── 仅把 video_url 文本写入 server 的 tasks 表（用于历史列表）
```

要点：

- **没有任何本地文件读写、没有 ffmpeg、没有本地下载**。`src/` 里没有 `fs`/`child_process`，`electron/` 也没有。
- **不依赖任何本地端口或本地服务**：唯一的 HTTP 依赖是远程 Express（开发态默认 `http://localhost:4178`）；客户端没有 sidecar、没有本地 ffmpeg、没有本地数据库。开发态的 Vite `5173` 只用于调试渲染层，生产态直接 `loadFile` 加载 `dist/index.html`。
- **未使用全局快捷键**（无 `globalShortcut`），系统托盘仅提供"显示主面板/退出"。
- 视频"存储"实际上是**供应商 URL 的字符串**，会过期、可能防盗链；Sora 的 base64 结果甚至不写库（`VideoGeneration.tsx` 里遇到 `data:` 前缀会跳过 `videoUrl` 记录）。
- OSS/ZOS 只用于**桌面安装包与官网分发**（`electron-builder.yml` 的 `publish.url`、`scripts/release-to-oss.mjs`），与用户视频内容无关。

### 1.6 构建、发布与更新

| 环节 | 现状 | 文件 |
| --- | --- | --- |
| 渲染层构建 | Vite，`base: './'`，产物 `dist/` | `vite.config.ts` |
| 主进程构建 | `tsc -p electron/tsconfig.json` → `dist-electron/` | `package.json` |
| 打包 | electron-builder，Windows `nsis-web`，输出 `release/` | `electron-builder.yml` |
| 更新 | `electron-updater` generic provider 指向 ZOS `release/`；启动检查、用户确认后下载 | `electron/main.ts` |
| 后端部署 | Docker Compose（mysql + server + nginx），对外 90 端口 | `deploy/docker-compose.yml`、`deploy/nginx.juese.conf` |
| 官网文档 | VitePress `site/`，Nginx `/docs/` | `deploy/nginx.juese.conf` |

---

## 2. 适配移动端的主要障碍（按影响大小排序）

| # | 障碍 | 影响 | 证据 | 处置 |
| --- | --- | --- | --- | --- |
| 1 | **视频生成在主进程，依赖无 CORS + Node crypto + 10 分钟前台轮询 + base64** | 致命：手机 WebView 直接调供应商会被 CORS 拦截；切后台轮询被系统挂起；Sora base64 撑爆内存 | `electron/video.ts`、`electron/main.ts` 的 `video:generate` | 生成全部迁到后端，客户端只提交任务 + 查询状态 |
| 2 | **后端只有 HTTP，无 TLS** | 致命：iOS ATS 默认拒绝；Android 9+ 默认拒绝 cleartext；上架审核也会被拒 | `.env.production`（`http://1.194.28.136:90`）、`deploy/nginx.juese.conf`（listen 90） | 上 HTTPS（域名 + 证书 + HSTS），客户端只允许 https |
| 3 | **供应商 API 普遍无 CORS、密钥必须保密** | 高：即使绕过后端直连，浏览器预检也会失败；把 Key 放前端等于公开 | `electron/video.ts`、`src/components/SettingsModal.tsx` | 由后端代理调用，Key 只存在服务端（加密） |
| 4 | **素材以 data URL 内联，表单/历史依赖大字段** | 高：手机原图数 MB，请求体与内存双爆；`image_url` 为 LONGTEXT | `src/components/features/VideoGeneration.tsx`、`server/src/db/schema.ts` | 先上传到对象存储拿 URL，客户端压缩后再传 |
| 5 | **桌面交互范式：悬浮球/无边框透明/拖拽/托盘/右键/多窗口** | 高：移动端没有这些概念，相关 UI 无法平移；49 处 `window.api` | `electron/main.ts`、`src/components/FloatingWindow.tsx`、`src/components/MainPanel.tsx` | 新做移动端外壳（底部 Tab + 全屏页面），适配层隔离 |
| 6 | **尺寸硬编码 1200×720 / 450×100 / 524×624** | 中高：手机上布局溢出、弹窗超屏 | `electron/main.ts`、`src/components/SettingsModal.tsx`、`RecommendationAssistantModal.tsx` | 响应式布局 + 移动断点 + 安全区 |
| 7 | **更新机制绑定 electron-updater** | 中：移动端无法自更新 | `electron/main.ts`、`electron-builder.yml` | 应用商店更新 + 服务端强制更新接口 |
| 8 | **密钥/令牌安全** | 中高：JWT 与 API Key 存 localStorage；服务端 Key 明文落库；JWT 7 天不可撤销 | `src/api/client.ts`、`server/src/modules/userApiKeys/route.ts`、`server/src/utils/jwt.ts` | Keychain/Keystore 存令牌；服务端 AES-GCM 加密 Key；短 access + 可撤销 refresh |
| 9 | **视频 URL 生命周期不可控** | 中：供应商链接过期/防盗链，历史任务变砖；无法分享/保存到相册 | `src/components/features/VideoGeneration.tsx`（`<video src>`）、`tasks.video_url` | 成功后回源下载到自有 OSS，签发自有时效 URL，生成缩略图 |
| 10 | **后台任务与断点续跑** | 中：手机切后台 JS 暂停，10 分钟轮询必然中断 | `electron/video.ts` 的轮询循环 | 任务状态落库，客户端回前台按 taskId 续查；可选推送 |
| 11 | **国内分发合规** | 中：App 备案、软著、隐私政策、AI 生成内容标识/审核 | 无 | 上架前补齐材料与内容安全能力 |
| 12 | **无崩溃/日志上报** | 低中：移动端问题难定位 | 无 | 接入 Sentry/自建上报 |

---

## 3. 可选路径对比

| 维度 | A. Capacitor 包壳（复用现有 Web） | B. React Native 重写 | C. 移动端 H5 + PWA | D. 原生 iOS/Android + 复用后端 |
| --- | --- | --- | --- | --- |
| UI/状态代码复用 | **高**（`src/` 大部分可复用） | 低（需重写全部组件） | **最高**（直接复用） | 无 |
| 视频生成改造量 | 与 C 相同：必须服务端化 | 相同：必须服务端化 | 相同：必须服务端化 | 相同 |
| 原生体验 | 中（WebView，需调优） | 高 | 中低（浏览器） | **最高** |
| 开发成本 | 中 | **高** | 低-中 | **高**（两套） |
| 上架能力 | 有（App Store / Play / 国内渠道） | 有 | 无商店，可加桌面图标 | 有 |
| 原生能力（相机/相册/分享/推送/后台） | 有（插件齐全） | 有 | 受限（iOS 尤甚） | 有 |
| 迭代速度 | 高（改 Web 即生效，需发版审核） | 中 | **最高**（即时） | 低 |
| 主要风险 | WebView 性能、iOS 审核 4.2（"套壳"判定） | 成本失控、双端不一致 | 无法上架、iOS 后台/推送/存储受限 | 人力翻倍 |
| 适用场景 | 表单 + 任务 + 播放为主，追求快落地 | 强交互/重动画/长期移动优先 | 快速验证、投放落地页 | 重原生媒体编辑 |

**结论：**

- 业务本质是"填表单 → 提交生成 → 看进度 → 播放/保存视频"，属于典型的内容型 + 表单型应用，不依赖复杂原生渲染。**Capacitor 足够**。
- 现有 `src/` 是纯 Web 技术栈（React + Tailwind），Capacitor 可以直接承载；只需要把 `window.api` 换成适配层、把桌面外壳换成移动外壳。
- 视频生成无论如何都要服务端化，RN 重写并不会减少这部分工作，反而额外增加全部 UI 重写成本——**排除 B**。
- **C 作为 A 的前置阶段**：先用响应式 H5 在真机浏览器验证交互和生成链路，成本极低，验证通过后同一套代码直接进 Capacitor。
- **D 仅作局部替换**：若后续需要原生视频剪辑、批量相册处理，再针对单页做原生模块，而非整体重写。

---

## 4. 推荐路径与目标架构

### 4.1 目标架构

```
┌──────────────────────────────────────────────┐
│ 移动 App（Capacitor WebView）                  │
│  React SPA（复用 src/，新增 src/mobile 外壳）   │
│  ├─ 平台适配层 src/platform/（window.api 抽象）│
│  ├─ 底部 Tab：生成 / 资源库 / 我的              │
│  └─ 原生插件：相机、相册、分享、推送、安全存储    │
└───────────────┬──────────────────────────────┘
                │ HTTPS + Bearer(access) + refresh
┌───────────────▼──────────────────────────────┐
│ Nginx（443，TLS，HSTS，CORS 白名单）            │
└───────────────┬──────────────────────────────┘
┌───────────────▼──────────────────────────────┐
│ Express 后端                                   │
│  ├─ /api/auth/*（access 2h + refresh 30d 轮换） │
│  ├─ /api/generation/tasks（新建/查询/取消）     │
│  ├─ /api/uploads（预签名直传 / 服务端中转）      │
│  ├─ /api/app/version（强制更新）                │
│  ├─ /api/push/devices（设备推送 token）         │
│  └─ 原有 bootstrap / tasks / user/*            │
│                                                │
│ Worker（同进程定时器 → 后续 BullMQ+Redis）      │
│  └─ 协议适配器（从 electron/video.ts 迁移）      │
└───────┬───────────────────────┬───────────────┘
        │                       │
┌───────▼────────┐      ┌───────▼────────────────┐
│ MySQL          │      │ 对象存储（ZOS/S3）+ CDN │
│ 任务/用户/配置  │      │ 参考素材 + 生成视频归档  │
└────────────────┘      └────────────────────────┘
        │
        ▼
   各视频供应商 API（服务端直连，无 CORS 限制）
```

### 4.2 前端改造

#### （1）平台适配层（关键，先做）

新增 `src/platform/`：

```ts
// src/platform/index.ts（示意）
export interface PlatformAdapter {
  openExternal(url: string): Promise<void>
  getVersion(): Promise<string>
  // 桌面专有；移动端为空实现
  expandWindowTo?(dims: { width: number; height: number }): Promise<void>
  collapseWindow?(): Promise<void>
  moveWindow?(x: number, y: number): Promise<void>
  setAutoLaunch?(v: boolean): Promise<void>
  // 移动端专有
  pickImages?(): Promise<Array<{ url: string; name: string }>>
  saveVideo?(url: string): Promise<void>
  share?(payload: { url?: string; text?: string }): Promise<void>
}
```

- Electron 构建：实现为现有 `window.api` 的包装（行为不变）。
- Web/Capacitor 构建：用 Vite `define`/alias 注入 Web 实现，所有 `window.api?.xxx?.()` 改为 `platform.xxx?.()`。
- 49 处调用点可分批替换，未替换的桌面专有调用在 Web 实现里返回 `undefined`/空 Promise 即可，不影响业务主流程。

#### （2）移动端外壳

新增 `src/mobile/`（或按构建入口拆分 `index.mobile.html`）：

- 底部 Tab：**生成 / 资源库 / 我的**；生成页为全屏表单 + 固定底部"生成"按钮。
- `VideoGeneration` 的双栏 + 可拖拽分隔条（`splitRatio`）改为上下堆叠：表单在上、进度/预览在下；历史任务改为独立 Tab 或抽屉。
- 详情/设置/推荐助手从"独立窗口"改为页面或全屏 Modal（移除 `?modal=` 与 `openRecommendationWindow`）。
- 安全区适配：`env(safe-area-inset-*)`；键盘避让（Capacitor Keyboard / `visualViewport`）。
- 移除：悬浮球、拖拽、托盘、右键菜单、自动收起计时器（`src/App.tsx` 中 60s 计时）、面板尺寸/透明度/置顶设置。
- 图片选择：`<input type="file" accept="image/*" capture>` 在 WebView 可用；接入 `@capacitor/camera` 获得更好体验。上传前用 Canvas 压缩到 ≤1MB（长边 ≤1920）再上传。

#### （3）需要改造的模块清单

| 模块 | 改造内容 |
| --- | --- |
| `src/App.tsx` | 拆分桌面/移动入口；移除自动收起与窗口尺寸副作用 |
| `src/components/MainPanel.tsx` | 移动端替换为 MobileShell；保留 FeatureTab 逻辑改为 TabBar |
| `src/components/FloatingWindow.tsx` | 移动端不引用 |
| `src/components/features/VideoGeneration.tsx` | 生成调用改为后端 API；上传流程；响应式布局；进度改为轮询/推送；播放/保存/分享 |
| `src/components/features/ResourceLibrary.tsx` | 卡片网格响应式；文件导入导出改为系统分享/文件选择 |
| `src/components/features/Customize.tsx` | 隐藏桌面项（自启/置顶/面板尺寸/透明度） |
| `src/components/SettingsModal.tsx` | 密钥输入改为"只写不回显"；Key 保存后不可再读原文 |
| `src/components/RecommendationAssistantModal.tsx` | 删除"关闭独立窗口"，改为页面返回 |
| `src/components/StandaloneUpdateModal.tsx` | 移动端不引用；"关于/更新"页显示商店版本 |
| `src/api/client.ts` | 增加 refresh token、统一错误码、请求重试；Token 存储改为平台安全存储 |
| `src/store/useStore.ts` | 拆分 `window.api` 调用；布局配置在移动端简化 |

### 4.3 后端新增/改造

#### （1）生成任务编排（核心）

新增 `server/src/modules/generation/`：

- `route.ts`
  - `POST /api/generation/tasks`：创建任务。入参 `providerId / modelId / prompt / resolution / ratio / duration / genMode / i2vMode / imageUrls[] / videoUrls[] / audioUrls[]`；服务端查库拿到供应商协议与路径、取用户（加密）Key、落库 `queued`、返回 `taskId`。
  - `GET /api/generation/tasks/:id`：返回 `status / progressMessage / videoUrl / error / providerTaskId`。
  - `POST /api/generation/tasks/:id/cancel`：尽力取消（部分供应商不支持，标记 `canceled`）。
  - `GET /api/generation/tasks?status=&page=`：列表（复用现有 `/api/tasks/mine` 也可）。
- `protocols/`：把 `electron/video.ts` 的 9 个协议拆成独立文件（`dashscope.ts`、`ark.ts`、`kling.ts`、`zhipu.ts`、`minimax.ts`、`runway.ts`、`luma.ts`、`openai.ts`、`pika.ts`），逻辑一一对应。可灵 JWT 用 Node `crypto` 保留在服务端。
- `worker.ts`：任务执行器。
  - 第一版：进程内 `setInterval` 扫描"queued/running 且未超时"的任务，逐条推进（简单、够用）。
  - 第二版：BullMQ + Redis（多实例、重试、并发控制、超时/退避）。
  - 幂等：以 `idempotencyKey`（客户端生成）防止重复扣费/重复提交。
- `service.ts`：状态机 `queued → submitted → running → succeeded / failed / canceled / timeout`，所有状态落库。

#### （2）任务表改造（`server/src/db/schema.ts`）

在 `tasks` 上新增（用现有 `addColumnIfMissing` 风格的幂等迁移）：

```
status            -> queued | submitted | running | succeeded | failed | canceled | timeout
progress_message  TEXT
provider_task_id  VARCHAR(128)
job_params        JSON/TEXT      -- 生成入参快照，便于重试
video_object_key  VARCHAR(255)   -- 自有 OSS 对象 key
thumbnail_url     VARCHAR(512)
video_expires_at  DATETIME       -- 供应商链接过期时间
idempotency_key   VARCHAR(64) UNIQUE
finished_at       DATETIME
```

`image_url` 从 LONGTEXT（base64）改为存对象存储 URL（`TEXT` 即可），迁移时兼容旧数据。

#### （3）素材上传

新增 `server/src/modules/uploads/route.ts`：

- 方案 A（推荐）：`POST /api/uploads/presign` 返回对象存储预签名 PUT URL + `objectKey`，客户端直传，服务端只登记。避免大文件过 Express。
- 方案 B（兜底）：`POST /api/uploads`（multer，限制 20MB/文件）→ 服务端上传对象存储。
- 校验：MIME、大小、图片解码校验；文件名随机化；对象 key 按 `user/{id}/{yyyymm}/{uuid}.{ext}`。
- 返回可访问 URL（CDN 或签名 URL）；生成接口只接受自家域名/对象存储的 URL，避免 SSRF。

#### （4）视频归档与播放

- 生成成功后：服务端下载供应商视频 → 上传对象存储 → 记录 `video_object_key` → 返回自有 CDN URL（或短时签名 URL）。
- 好处：解决链接过期/防盗链；支持历史回放、分享、手机"保存到相册"；为后续转码/封面打基础。
- 后续可选：服务端 ffmpeg 转 H.264/AAC + 生成封面/时长（这一步才需要引入 ffmpeg，当前项目完全没有）。

#### （5）鉴权改造

- `POST /api/auth/refresh`：refresh token（30 天，轮换 + 复用检测）换新 access token（2 小时）。
- `POST /api/auth/logout`：吊销当前 refresh token。
- 新增 `refresh_tokens` 表（`user_id / token_hash / device / expires_at / revoked_at`）。
- 登录/发码限流（按 IP + 账号）；失败次数锁定。
- 密码/邮箱验证码流程可复用现有实现（`server/src/modules/auth/route.ts`）。
- 第三方登录（Apple 登录为 iOS 上架常见要求）后续按需补。

#### （6）密钥安全

- `user_api_keys.encrypted_key`：用 AES-256-GCM 加密，密钥来自环境变量 `KEK`（后续可接 KMS）；返回给客户端永远只给掩码（如 `sk-****abcd`）。
- 生成时服务端解密使用，**手机端不再持有供应商 Key**。
- 若必须保留"用户自带 Key 且不上传"的模式，则改为一次性传输 + 仅存设备 Keychain，且需要说明这会限制服务端生成（与推荐路径冲突）。**建议改为服务端托管密钥。**

#### （7）推送与版本

- `POST /api/push/devices`：登记 APNs/FCM token；生成完成推送（可选，先做站内轮询）。
- `GET /api/app/version?platform=ios&version=1.2.0`：返回 `latest / minSupported / forceUpdate / notes / storeUrl`。
- 管理后台新增"App 版本管理"页（复用现有 admin 结构）。

#### （8）后端接口总览（新增部分）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/generation/tasks` | 创建生成任务 |
| GET | `/api/generation/tasks/:id` | 查询状态/进度/结果 |
| POST | `/api/generation/tasks/:id/cancel` | 取消 |
| POST | `/api/uploads/presign` | 获取直传签名 |
| POST | `/api/uploads` | 服务端中转上传（兜底） |
| POST | `/api/auth/refresh` | 刷新令牌 |
| POST | `/api/auth/logout` | 吊销令牌 |
| GET | `/api/app/version` | 版本/强制更新 |
| POST | `/api/push/devices` | 登记推送设备 |

### 4.4 更新机制变化

| 端 | 现状 | 移动端方案 |
| --- | --- | --- |
| 桌面 | `electron-updater` + ZOS `latest.yml` | 保持不变 |
| Android | — | Google Play / 国内渠道商店更新；自有 APK 渠道可用"下载新 APK + 引导安装" |
| iOS | — | App Store 更新（唯一合规途径）；启动调 `/api/app/version` 提示强更 |
| Web 资源 | — | 随包发布；服务端已可通过 `/api/bootstrap` 下发功能/模型配置，无需热更代码 |

注意：**不要**在 iOS 上做 WebView 热更新（动态下发可执行 JS）规避审核，违反 App Store 规则；配置类下发（现有 bootstrap）是安全的。

### 4.5 打包与分发

#### Capacitor 配置要点

- `appId: com.juese.app`（与 `electron-builder.yml` 一致），`appName: 绝色`。
- Android：`minSdkVersion 23`、`targetSdkVersion 35`；`android:usesCleartextTraffic="false"`；签名 keystore 入 CI 密钥；Google Play 用 AAB，国内渠道用 APK。
- iOS：最低 iOS 14/15；开启 ATS（禁止 `NSAllowsArbitraryLoads`）；`NSCameraUsageDescription`、`NSPhotoLibraryAddUsageDescription`、`NSPhotoLibraryUsageDescription`；`PrivacyInfo.xcprivacy`（2024 起必需）。
- 插件：`@capacitor/camera`、`@capacitor/filesystem`、`@capacitor/share`、`@capacitor/push-notifications`、`@capacitor/preferences`、`@capacitor/browser`、`@capacitor/status-bar`、`@capacitor/keyboard`、`@capacitor/splash-screen`、`@capacitor/app`。
- 网络安全：WebView 只允许 `https://api.<domain>`；`server.allowNavigation` 白名单 CDN 域名。

#### 分发渠道与合规（国内为重点）

| 事项 | 说明 |
| --- | --- |
| HTTPS 域名 | 需域名 + 证书；当前 80/443 未备案，先解决备案或使用海外域名 |
| App 备案 | 国内分发的 App（iOS/Android）需工信部备案 |
| 软件著作权 | 国内 Android 商店上架通常要求 |
| 隐私合规 | 隐私政策、用户协议、权限申请说明、第三方 SDK 清单、个人信息收集清单 |
| 内容安全 | AI 生成内容需标识与审核（《生成式人工智能服务管理暂行办法》《AI 生成合成内容标识办法》） |
| 应用商店素材 | 图标、截图、描述、年龄分级、隐私标签（App Store 隐私营养标签） |
| iOS 审核风险 | 4.2 最低功能：需具备相机/相册/分享/推送/离线等原生能力，不能是纯网页壳；5.1.1(v) 账号删除入口 |

#### 上架所需原生能力（用于规避"套壳"判定）

- 相机/相册选图 + 本地压缩（真实原生调用）
- 保存视频到相册 + 系统分享
- 推送通知（生成完成提醒）
- 离线历史缓存（IndexedDB / 本地文件）
- 生物识别解锁（可选，保护密钥）

### 4.6 分阶段实施建议

> 用依赖关系而非工期表达；每阶段结束都有可验证产出。

#### P0 · 基座（不做则任何移动端方案不可行）

1. 后端上 HTTPS（域名 + 证书 + HSTS），客户端 API Base 强制 https。
2. 迁移生成编排到服务端（`server/src/modules/generation/`），先支持 dashscope / ark / kling 三个已成熟协议，其余按需。
3. 新增任务状态查询接口，任务表加状态字段；客户端轮询改为查后端。
4. 新增上传接口 + 对象存储；前端改为"压缩 → 上传 → 拿 URL"。
5. 后端 Key 加密存储；生成时服务端解密。
6. 验收：手机浏览器打开 H5，能完成"登录 → 配置 Key → 上传参考图 → 生成 → 播放"全流程；切换后台再回前台能续查任务。

#### P1 · 移动 Web 外壳（可先上线验证）

1. 新增 `src/platform/` 适配层，替换 49 处 `window.api` 调用。
2. 新增移动端外壳：底部 Tab、全屏页面、安全区、键盘避让。
3. 生成页响应式改造；推荐助手/设置/反馈改为页面内 Modal；移除桌面专有设置。
4. 部署到 `m.<domain>`（同一后端），埋点与错误上报（Sentry）。
5. 验收：iPhone Safari / Android Chrome 全流程可用；无横向滚动；无桌面残留入口。

#### P2 · Android 包壳内测

1. 接入 Capacitor，生成 `android/` 工程；配置签名、图标、启动图。
2. 接入相机/相册/分享/安全存储/状态栏/键盘插件。
3. 生成完成推送（FCM）可选；保存到相册。
4. 打包 APK 内测（蒲公英/TestFlight 等价渠道），收集崩溃与性能数据。
5. 验收：真机安装可完成全流程；切后台/杀进程后任务不丢；相册保存成功。

#### P3 · iOS 上架 + 双端发布

1. 生成 `ios/` 工程；配置 ATS、权限文案、隐私清单。
2. Apple 登录（如需要）、推送（APNs）、账号删除入口。
3. 强制更新接口 + "关于/版本"页。
4. 准备商店素材与合规材料（备案、软著、隐私政策、内容审核说明）。
5. 验收：TestFlight 通过；审核意见闭环；双端版本号与服务端 `minSupported` 匹配。

#### P4 · 体验与成本优化

1. 视频归档 + 封面/时长 + 可选转码（引入服务端 ffmpeg）。
2. 任务队列升级为 BullMQ + Redis，支持并发/重试/多实例。
3. 离线历史、收藏、多端同步（现有 `user_configs` 可扩展）。
4. 支付/额度（如从 BYO Key 转为平台计费，需处理 Apple IAP 30% 与国内支付合规）。

---

## 5. 工作量与风险评估（相对量级）

| 工作项 | 量级 | 依赖 | 风险 |
| --- | --- | --- | --- |
| HTTPS + 域名/证书/备案 | S | 域名、备案 | 备案周期不可控 |
| 服务端生成编排（迁 9 协议） | L | P0 | 协议差异、超时/重试、成本 |
| 任务队列（BullMQ） | M | Redis | 运维复杂度 |
| 上传 + 对象存储 | M | 存储账号/权限 | 直传签名与防盗链 |
| 鉴权 refresh + 安全存储 | M | 无 | 迁移期兼容旧 token |
| 平台适配层 + 移动外壳 | M-L | P0 | 49 处调用点遗漏 |
| 移动 UI 响应式 | M | 外壳 | 小屏表单体验 |
| Capacitor Android | M | P1 | 签名/渠道 |
| Capacitor iOS + 上架 | L | P2 | 审核（4.2/5.1.1）、备案 |
| 视频归档/转码 | M | 对象存储 | 存储与带宽成本 |

**最大风险不是技术，而是模式变更**：当前是"客户端直连供应商、用户自带 Key"，迁到服务端意味着平台要经手用户密钥与生成流量。这会影响隐私承诺、成本结构与合规责任，需要产品层面拍板（见第 6 节）。

---

## 6. 待决策问题（需要你确认）

1. **是否接受生成迁到服务端？** 服务端需要代持（加密）用户 API Key 并中转请求；这是移动端可行性的前提。若坚持"Key 不出设备"，则只能做纯 H5 且仍受 CORS 限制，基本不可行。
2. **首发形态**：先上移动 H5/PWA 验证（快、可回滚），还是直接做双端安装包（周期长、需合规）？
3. **目标市场**：国内为主（需 App 备案、软著、内容审核、AI 标识）还是海外为主（App Store/Play、隐私标签、可能的 IAP）？两者合规路径不同。
4. **商业模式**：继续"用户自带 Key"，还是改为平台统一额度/订阅？后者涉及支付与 Apple IAP。
5. **视频是否必须落自有 OSS？** 落库能解决过期/分享/保存相册，但增加存储与带宽成本。
6. **是否有原生刚需**（视频剪辑、批量相册、离线缓存）？若有，评估是否对单页做原生模块，而不是整体 RN。

---

## 7. 附录

### 7.1 关键文件索引（仓库相对路径）

**桌面/主进程**

- `electron/main.ts` —— 窗口、托盘、自启、多窗口、IPC、自动更新
- `electron/preload.ts` —— `window.api` 暴露面
- `electron/shared/ipc.ts` —— IPC 通道与类型、视频生成参数类型
- `electron/video.ts` —— 9 种供应商协议、轮询、可灵 JWT、Sora base64

**渲染层**

- `src/App.tsx` —— 入口/弹窗分流/自动收起
- `src/store/useStore.ts` —— Zustand + persist 全量状态
- `src/api/client.ts` —— HTTP 封装、Token、API Base
- `src/types/index.ts` —— 领域类型
- `src/components/MainPanel.tsx` —— 主面板/工具栏/功能页
- `src/components/FloatingWindow.tsx` —— 悬浮球拖拽
- `src/components/features/VideoGeneration.tsx` —— 生成表单/进度/历史/播放
- `src/components/features/ResourceLibrary.tsx` —— 模型库/自定义供应商
- `src/components/features/Customize.tsx` —— 布局/主题/自启/置顶
- `src/components/SettingsModal.tsx` —— API Key 管理
- `src/components/RecommendationAssistantModal.tsx` —— AI 助手（独立窗口）
- `src/components/StandaloneUpdateModal.tsx` —— 独立更新弹窗

**后端**

- `server/src/index.ts` —— 启动、CORS、静态托管
- `server/src/routes/index.ts` —— 路由挂载
- `server/src/middleware/auth.ts`、`server/src/utils/jwt.ts` —— 鉴权
- `server/src/modules/auth/route.ts` —— 登录/注册/邮箱验证码
- `server/src/modules/bootstrap/route.ts` —— 启动聚合配置
- `server/src/modules/tasks/route.ts` —— 任务记录
- `server/src/modules/userApiKeys/route.ts` —— 用户密钥（当前明文）
- `server/src/modules/userConfigs/route.ts` —— 用户布局配置
- `server/src/db/schema.ts` —— 表结构
- `server/src/config/index.ts` —— 端口/JWT/CORS 配置

**构建/部署**

- `vite.config.ts`、`package.json`、`electron-builder.yml`
- `.env.production`（当前 API 为 HTTP）
- `deploy/docker-compose.yml`、`deploy/nginx.juese.conf`
- `scripts/release-to-oss.mjs`、`scripts/oss-client.mjs`（发布用，与用户视频无关）

### 7.2 现有 IPC 通道清单（迁移时的对照表）

**窗口/系统类（移动端全部不需要）**

`window:expand`、`window:expand-to`、`window:collapse`、`window:move`、`window:save-position`、`window:get-position`、`window:hide`、`window:set-always-on-top`、`window:minimize`、`window:toggle-maximize`、`window:is-maximized`、`window:dropdown-open`、`window:dropdown-close`、`panel-size:get`、`panel-size:set`、`auto-launch:get`、`auto-launch:set`、`show-context-menu`、`context-menu:settings`、`window:ball-side`、`app:quit`

**能力类（换实现）**

`open-external`、`updater:download`、`updater:install`、`updater:get-version`、`update-window:close`、`update-window:event`、`recommendation-window:open`、`recommendation-window:close`

**业务类（迁后端）**

`video:generate`、`video:progress`

### 7.3 现有后端 API 清单

```
GET  /api/health
POST /api/auth/login | /api/auth/login-email | /api/auth/register
POST /api/auth/send-email-code
GET  /api/auth/me
GET  /api/bootstrap
GET  /api/providers | /api/models | /api/features | /api/video-config
GET/POST/DELETE /api/users
GET/POST/DELETE /api/user/api-keys
GET/POST /api/user/configs
POST /api/tasks
GET  /api/tasks | /api/tasks/mine | /api/tasks/stats
DELETE /api/tasks/:id | /api/tasks/mine/:id
POST /api/tasks/mine/batch-delete | /api/tasks/mine/delete-failed
POST /api/feedback ; GET /api/feedback/mine
GET  /api/recommend | /api/guide
GET  /api/system-config
```

### 7.4 一句话总结

**移动端适配的真正工作量不在"把界面搬到手机上"，而在"把生成编排从桌面主进程搬到后端，并补齐 HTTPS、上传、鉴权与视频归档"。** 完成这一步后，用 Capacitor 承载现有 React 代码是最省成本、最快验证、也最可控的路径。
