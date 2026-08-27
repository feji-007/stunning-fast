# 部署运维

推荐架构：**小应用服务器 + OSS/CDN 托管下载与官网**。下载洪峰不冲击业务接口。

## 架构总览

| 部分 | 部署位置 | 规格 |
| --- | --- | --- |
| 后端 API + 管理后台 | 应用服务器（4C8G） | Express + MySQL |
| 安装包 / 官网 / 文档 | OSS + CDN | 静态资源，扛带宽 |

## 一、应用服务器

1. 准备一台 4 vCPU / 8G / 80G SSD 云主机。
2. 安装 Node.js ≥ 18 与 MySQL ≥ 8.0，建库 `stunning_fast`。
3. 上传 `server/` 目录，`npm install`、`npm run admin:build`、`npm run build`。
4. 用 pm2 守护：`pm2 start dist/index.js --name stunning-server`。
5. Nginx 反代 `api.你的域` → `127.0.0.1:4178`，并配置 HTTPS（Let's Encrypt）。

## 二、OSS + CDN（下载与官网）

1. 创建对象存储桶（推荐 Cloudflare R2，出站免费），存放：
   - `releases/` 安装包与 `latest.yml` 系列更新清单
   - `site/` 官网与文档静态产物
2. 绑定 CDN，回源到 OSS。
3. 域名解析：`你的域`（官网/下载/文档）→ CDN；`api.你的域` → 应用服务器。

::: tip Cloudflare R2 详细配置
创建桶、API Token、绑定自定义域名、缓存刷新的完整步骤见 [Cloudflare 配置](/guide/cloudflare-setup)。
:::

## 三、构建并发布安装包

```bash
# 项目根目录打包（生成 dist-electron/ 与安装包 + latest.yml）
npm run dist
```

产物上传到 OSS `releases/` 目录，客户端启动自动检测 `latest.yml` 更新。

## 四、构建并发布官网

```bash
cd site
npm install
npm run build      # 产物在 site/.vitepress/dist
# 上传 dist 到 OSS 根目录或对应子路径
```

修改 `site/.vitepress/config.ts` 顶部的 `DOWNLOAD_BASE` 为实际 CDN 地址。

::: tip 详细步骤
完整命令清单与排错见仓库根目录 `DEPLOY.md`。
:::