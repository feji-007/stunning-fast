# Cloudflare 配置

本页指导完成 Cloudflare R2 对象存储 + CDN 的完整配置，用于托管「绝色」的安装包、官网与自动更新清单。所有步骤一次性完成，后续发版无需重复。

::: tip 为什么选 Cloudflare R2
- **出站流量免费**：相比国内 OSS 按量计费，下载洪峰零成本
- **自带全球 CDN**：边缘节点加速，国内可用自定义域名
- **S3 兼容 API**：直接用 `@aws-sdk/client-s3`，无需专用 SDK
- **Free 套餐够用**：10GB 存储免费 + 出站免费
:::

## 一、前置条件

- Cloudflare 账号（注册 [cloudflare.com](https://cloudflare.com)，免费）
- 一个域名（如 `juese.app`）。**若要用自定义域名走 CDN**，需把域名 NS 指向 Cloudflare；若仅用 R2 的 `r2.dev` 开发地址则不需要。

## 二、创建 R2 桶

1. 登录 Cloudflare → 左侧栏 **R2 Object Storage**
2. 首次使用会提示绑定信用卡（**不会扣费**，仅用于验证；Free 套餐含 10GB 存储 + 出站免费）
3. 点击 **Create bucket**
4. 填写：
   - Bucket name：`juese-assets`
   - Location：默认（Auto），或选离主要用户群近的区域
5. **Create** 完成

## 三、创建 R2 API Token（上传用）

1. R2 概览页右侧 → **Manage R2 API Tokens** → **Create API token**
2. 填写：
   - Token name：`juese-uploader`
   - Permissions：**Object Read & Write**
   - Specify bucket(s)：选 `Specify bucket(s)` → 勾选 `juese-assets`（限制作用域更安全）
3. **Create API Token**
4. 创建后页面会显示三样信息，**仅显示一次，务必立即保存**：
   - **Access Key ID**
   - **Secret Access Key**
   - **Endpoint**：形如 `https://<account_id>.r2.cloudflarestorage.com`，其中 `<account_id>` 即配置项 `R2_ACCOUNT_ID`

::: warning Token 只显示一次
关闭页面后无法再查看 Secret Access Key。若丢失只能删除 Token 重建。
:::

## 四、绑定自定义域名（生产 CDN）

1. R2 → `juese-assets` 桶 → **Settings** → **Custom Domains** → **Connect Domain**
2. 输入 `cdn.juese.app` → **Continue**
3. 若域名 `juese.app` 已在同一 Cloudflare 账号，会自动添加 CNAME 记录
4. 等待状态从 **Initializing** 变为 **Active**（通常几分钟）
5. 完成后 `https://cdn.juese.app/` 即该桶的公开访问入口

::: info 域名需托管在 Cloudflare
自定义域名走 Cloudflare CDN 的前提是域名 `juese.app` 的 NS 指向 Cloudflare。若域名不在 CF，先到 **Websites** → **Add a site** 添加域名并按提示修改 NS。
:::

## 五、开启 Public dev URL（开发期可选）

适合本地联调，不想配自定义域名时用：

1. R2 → `juese-assets` → **Settings** → **Public access** 区域
2. 开启 **R2.dev subdomain**（Allow Access）
3. 得到形如 `https://pub-<hash>.r2.dev` 的地址
4. 在 `.env` 里把 `R2_PUBLIC_BASE` 设为该地址即可

::: warning 仅开发用
`r2.dev` 地址有速率限制，不适合生产。生产环境务必用自定义域名。
:::

## 六、创建 Cache Purge API Token（缓存刷新用）

用于上传 `latest*.yml` 后立即刷新 CDN，让客户端马上检测到新版本：

1. 右上角头像 → **My Profile** → **API Tokens** → **Create Token**
2. 选 **Custom token** → Get started
3. 配置：
   - Token name：`juese-cache-purge`
   - Permissions：**Zone** → **Cache Purge** → **Purge**
   - Zone Resources：**Include** → **Specific zone** → 选 `juese.app`
4. **Continue to summary** → **Create Token**
5. 记录显示的 **Token**（即 `CF_API_TOKEN`，仅显示一次）

### 获取 Zone ID

1. 左侧栏 **Websites** → 点击域名 `juese.app`
2. 概览页右下角 **API** 区域，复制 **Zone ID**（即 `CF_ZONE_ID`）

## 七、配置 scripts/.env

把 [scripts/.env.example](https://github.com/) 复制为 `scripts/.env`，填入：

```bash
# 来自步骤三（Endpoint 中的 account_id）
R2_ACCOUNT_ID=<account_id>
R2_ACCESS_KEY_ID=<步骤三 Access Key ID>
R2_SECRET_ACCESS_KEY=<步骤三 Secret Access Key>
R2_BUCKET=juese-assets
R2_PUBLIC_BASE=https://cdn.juese.app      # 步骤四的自定义域名

# 来自步骤六
CF_API_TOKEN=<步骤六 token>
CF_ZONE_ID=<步骤六 zone id>
```

::: tip .env 不要提交到 git
项目 `.gitignore` 已忽略 `.env`。本仓库只提交 `.env.example` 模板。
:::

## 八、CDN 缓存规则说明

上传脚本已为每个文件设置 `Cache-Control` 头，Cloudflare 默认遵循源站规则，**通常无需额外配置**：

| 文件类型 | 源站 Cache-Control | 说明 |
| --- | --- | --- |
| `releases/latest*.yml` | `max-age=300`（5 分钟） | 更新清单，需较快生效 |
| `releases/*.exe / *.dmg / *.blockmap` | `max-age=2592000, immutable`（30 天） | 安装包不变，长缓存 |
| 官网 `*.html` | `max-age=300` | 首页内容可能更新 |
| 官网 `assets/*`（js/css/图片） | `max-age=2592000, immutable` | 带 hash，可长缓存 |

::: warning latest*.yml 的双重保障
即使忘了配 `CF_API_TOKEN`，`latest*.yml` 也会在 5 分钟内因短缓存过期而更新。缓存刷新只是让更新**立即**生效，非必需但强烈建议。
:::

若需强制覆盖源站规则，可在 **Rules → Cache Rules** 添加规则，但一般无需。

## 九、CI/CD Secrets（GitHub Actions）

仓库 **Settings → Secrets and variables → Actions → New repository secret**，逐个添加：

| Secret | 值 |
| --- | --- |
| `R2_ACCOUNT_ID` | 步骤三 account_id |
| `R2_ACCESS_KEY_ID` | 步骤三 |
| `R2_SECRET_ACCESS_KEY` | 步骤三 |
| `R2_BUCKET` | `juese-assets` |
| `R2_PUBLIC_BASE` | `https://cdn.juese.app` |
| `CF_API_TOKEN` | 步骤六 |
| `CF_ZONE_ID` | 步骤六 |

配置后，推送 `v*` 标签即可触发 [release.yml](https://github.com/) 自动打包+上传+刷新。

## 十、验证配置

```bash
# 1. 本地测试上传（先打个包）
npm run dist
npm run upload:release

# 2. 控制台会输出 CDN URL，浏览器访问应能下载安装包
# 3. 上传后自动刷新 CDN，访问 latest.yml 应为最新内容
# 4. CI 验证
git tag v0.0.1-test && git push origin v0.0.1-test
# 到 GitHub Actions 页面查看 workflow 运行
```

## 十一、常见问题

| 现象 | 原因 / 解决 |
| --- | --- |
| 上传报 403 Forbidden | R2 Token 权限不足，或未勾选目标桶；重建 Token 选 Object Read & Write 并指定桶 |
| 访问 URL 返回 404 | 桶名错 / key 路径错；或自定义域名状态未 Active |
| `latest.yml` 旧内容不更新 | 未配 `CF_API_TOKEN`/`CF_ZONE_ID`，或 Cache Purge token 权限选错；脚本会跳过刷新，最长等 5 分钟 |
| 自定义域名不生效 | 域名 NS 未指向 Cloudflare；或 CNAME 未生效，到 DNS 页检查 |
| `[cf] 缓存刷新失败` | token 权限非 Zone > Cache Purge，或 Zone ID 错；按步骤六重建 token |
| R2 提示需绑定支付 | Free 套餐仍需验证支付方式，绑定后不会扣费 |

---

完成上述配置后，整套发布链路（打包 → 上传 R2 → 刷新 CDN → 客户端自动更新）即可投入使用。