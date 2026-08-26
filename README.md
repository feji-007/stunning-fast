# 绝色 · Stunning Fast

> AI 视频生成桌面助手 —— 绝色巴黎香槟主题，悬浮窗模式，多供应商模型自由切换。

**绝色**（取 *Stunning* 的中文意「惊艳 / 绝色」，寓意「惊艳绝伦」）是一个基于 Electron 的轻量桌面应用。程序启动后仅以迷你悬浮窗驻留桌面，悬停即展开主功能面板，离开 5 秒自动折叠。内置视频生成、资源库、自定义三大核心功能，并已接入通义万相、火山引擎 Seedance、快手可灵三家真实视频生成 API，用户可在模型列表中自由切换。整体采用「绝色巴黎香槟」暖金主题，象牙白底配香槟金与古金，暖调奢华。

## 功能特性

- **悬浮窗交互**：默认仅显示迷你悬浮触点，鼠标悬停展开主面板，离开 5 秒自动折叠；悬浮窗可自由拖动并记忆位置，重启后恢复。
- **主面板布局**：横向并列的核心功能入口，超出数量收纳于右侧「···」展开；点击入口展开独立功能页，原入口收纳为顶部标签，一键返回。
- **免登录启动**：默认不要求登录，右上角显示「未登录」；点击登录或使用受限功能时弹出登录/注册页。
- **视频生成**：自动匹配 API 或手动切换模型；清晰度（720P/1080P）与宽高比（16:9/9:16/1:1/4:3/3:4）可选；生成进度实时回显，完成后内嵌预览并可下载。
- **资源库**：罗列主流 AI 模型，支持搜索与类型筛选，帮助用户挑选更适配的资源。
- **自定义**：可调整功能展示位（常用上移、不常用隐藏）、悬浮窗置顶、开机自启（默认关闭）。
- **多供应商共存**：通义万相 / 火山 Seedance / 快手可灵三家真实接入，协议差异由主进程自动归一化，用户无感切换。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面运行时 | Electron 31 |
| 渲染层 | React 18 + TypeScript |
| 构建工具 | Vite 5 |
| 样式 | TailwindCSS 3 |
| 状态管理 | Zustand（localStorage 持久化）|
| 本地存储 | electron-store（窗口位置、开机自启等）|
| 网络 | 主进程 Node `fetch`（规避渲染层 CORS），可灵 JWT 用 Node `crypto` 签发 |

## 主题色：绝色巴黎香槟

整体采用暖调香槟金主题，定义于 `tailwind.config.js` 的 `brand` 色阶，全站 `brand-*` 用法自动跟随：

| 色阶 | 色值 | 用途 |
| --- | --- | --- |
| `brand-50` | `#FBF5EA` | 象牙香槟底 |
| `brand-100` | `#F4E8CF` | 奶油 / 进度条底 |
| `brand-300` | `#DDB874` | 柔金 |
| `brand-400` | `#CDA050` | 亮香槟金（悬浮气泡、徽标，配深色文字）|
| `brand-500` | `#946C29` | 古金（主按钮，白字，对比 ≥4.5:1）|
| `brand-600/700` | `#78571F` / `#5E4419` | hover / pressed |

## 环境要求

- Node.js ≥ 18（推荐 20+，主进程使用原生 `fetch`）
- npm ≥ 9
- Windows 10/11（已适配主流分辨率与缩放比例）

## 安装

```bash
# 1. 克隆 / 进入项目目录
cd stunning-fast

# 2. 安装依赖（首次安装会下载 Electron 二进制，请保持网络通畅）
npm install
```

> 若 Electron 二进制下载缓慢或失败，可设置镜像：
> ```bash
> set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
> npm install
> ```

## 启动

### 开发模式（热重载）

```bash
npm run dev
```

并行启动 Vite 开发服务器（`http://localhost:5173`）与 Electron 主进程，渲染层改动即时生效。

### 生产构建

```bash
npm run build
```

依次执行：Vite 打包渲染层到 `dist/`，`tsc` 编译 Electron 主进程到 `dist-electron/`。

### 运行已构建产物

```bash
npm start
```

以生产模式启动应用，加载 `dist/` 与 `dist-electron/` 产物。

## 项目结构

```
stunning-fast/
├── electron/                # 主进程
│   ├── main.ts               # 窗口/托盘/位置记忆/开机自启/IPC 注册
│   ├── preload.ts            # contextBridge 桥接
│   ├── video.ts              # 多供应商视频生成客户端（DashScope/Seedance/可灵）
│   └── shared/ipc.ts         # 跨进程共享类型与 IPC 通道
├── src/
│   ├── App.tsx               # 悬停展开/折叠编排
│   ├── components/
│   │   ├── FloatingWindow.tsx     # 迷你悬浮触点（可拖拽）
│   │   ├── MainPanel.tsx          # 主面板（横向入口 + 顶部标签）
│   │   ├── LoginModal.tsx         # 登录/注册
│   │   ├── SettingsModal.tsx      # 密钥管理
│   │   └── features/              # 各功能独立页
│   │       ├── VideoGeneration.tsx
│   │       ├── ResourceLibrary.tsx
│   │       ├── Customize.tsx
│   │       └── PlaceholderFeature.tsx
│   ├── data/models.ts       # 供应商与模型资源库数据
│   ├── store/useStore.ts     # Zustand 状态（持久化）
│   └── types/index.ts       # 类型定义
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## 已接入视频生成供应商

三家均为「提交异步任务 → 轮询 → 取视频地址」流程，协议差异由主进程 `electron/video.ts` 的 `generateVideo` 路由器统一分发：

| 供应商 | 鉴权 | 端点 | 可用模型 |
| --- | --- | --- | --- |
| 通义万相 (DashScope) | Bearer `sk-xxx` | `dashscope.aliyuncs.com` | wan2.7 / wan2.6 / wan2.2 / wan2.1-turbo / wan2.1-plus |
| 火山引擎 Seedance (Ark) | Bearer `volc-sk-xxx` | `ark.cn-beijing.volces.com` | Seedance 2.5 / 2.0 / 2.0-fast / 1.5-pro / 1.0-pro-fast |
| 快手可灵 (Kling) | JWT（AccessKey + SecretKey）| `api-beijing.klingai.com` | kling-v3 / v2-master / v2.5-turbo / v1.6 |

> 其他供应商（MiniMax / Runway / Pika / Luma 等）已在资源库中列出，生成走演示分支，可在 `video.ts` 的 `generateVideo` 路由 `switch` 中扩展接入。

## 配置 API 密钥

1. 启动应用，点击头像 → **设置**。
2. 找到对应供应商，粘贴密钥后保存。系统自动探测可接入的供应商，并在视频生成页展示可用模型列表。
3. 密钥格式说明：
   - **通义万相**：阿里云百炼控制台获取，以 `sk-` 开头。
   - **火山引擎**：火山引擎 Ark 控制台获取的 API Key。
   - **快手可灵**：可灵开放平台 `API 管理` 页获取，填入 **`AccessKey:SecretKey`**（中间一个英文冒号），程序据此签发 JWT。

## 生成流程

1. 主面板点击「视频生成」入口。
2. 输入提示词，选择清晰度与宽高比。
3. 自动匹配模式下默认选用首个可用视频模型；可切换为手动模式点选任意模型。
4. 点击「生成视频」，进度依次显示「提交任务 → 排队中 → 生成中 → 完成」。
5. 完成后页面内嵌预览视频，并提供下载/浏览器打开链接。

## 常见问题

- **生成失败提示 401 / 鉴权错误**：检查设置中对应供应商密钥是否正确、是否已开通模型调用权限与计费。
- **可灵提示「access key not found」**：确认密钥格式为 `AccessKey:SecretKey`，且 AccessKey/SecretKey 均非空。
- **悬浮窗位置丢失**：程序会记忆上次拖动位置并校正到屏幕可见区；若多显示器拔除导致越界，重启后会自动归位。
- **Electron 安装失败**：使用上文镜像变量重试，或切换 npm 源。

## License

MIT
