# 服务器配置建议

本页给出部署「绝色」整套服务（后端 API + 管理后台 + 数据库 + 官网/下载分发）的硬件选型建议，按用户规模分档，可直接照搬下单。

::: tip 架构原则
**应用服务器**（Docker Compose）扛计算与数据库，**Cloudflare R2 + CDN** 扛下载与静态资源带宽，两者解耦后可独立扩容。下载洪峰绝不冲击业务接口。
:::

## 一、分档速查

| 规模 | 应用服务器 | 数据库 | R2 + CDN | 月成本（估） |
| --- | --- | --- | --- | --- |
| 个人 / 内测（≤ 50 人） | 2C4G / 60G SSD | 与应用同机 MySQL（Docker 容器） | R2 Free 套餐 + CDN | ¥80 ~ ¥200 |
| 标准生产（≤ 1000 人） | 4C8G / 100G SSD | 与应用同机 MySQL（Docker 容器） | R2 + CDN 按量 | ¥250 ~ ¥600 |
| 中大规模（≥ 5000 人） | 8C16G ×2 + SLB | 独立 MySQL 主从 | R2 + CDN 高配 | ¥1200 ~ ¥3000 |

::: warning 同机数据库的边界
前两档把 MySQL 装在应用服务器同机（作为 Docker Compose 的一个容器），省成本。当并发连接数持续 > 200 或单表数据 > 500 万行时，应拆出独立数据库实例。
:::

## 二、应用服务器规格

| 项目 | 标准生产（推荐） | 最小起步 | 大规模 |
| --- | --- | --- | --- |
| vCPU | 4 | 2 | 8（×2 节点 + 负载均衡） |
| 内存 | 8G | 4G | 16G |
| 系统盘 | 100G SSD | 60G SSD | 100G SSD |
| 数据盘 | 80G SSD（挂 `/data`，MySQL 数据卷） | 与系统盘共用 | 200G SSD |
| 公网带宽 | 5 Mbps | 3 Mbps | 10 Mbps + CDN 兜底 |
| 系统 | Ubuntu 22.04 LTS / Debian 12 / CentOS 7.9 | 同左 | 同左 |
| 进程守护 | Docker Compose（`restart: unless-stopped`） | 同左 | Docker Compose + 多实例 |

::: info 带宽为何只要 5 Mbps
应用服务器只跑 API（请求小、响应快），下载流量全部走 CDN。5 Mbps 足够支撑千级日活的 API 调用；带宽瓶颈由 CDN 承接。
:::

::: tip Docker 部署
应用服务器无需手动装 Node.js / MySQL / Nginx——Docker Compose 一键拉起 `mysql` / `server` / `nginx` 三容器，数据持久化到 named volume。详见 [部署运维](/guide/deploy)。
:::

## 三、Cloudflare R2 + CDN 配置

### 3.1 对象存储（R2）

| 项 | 建议 |
| --- | --- |
| 选型 | Cloudflare R2（出站流量免费，S3 兼容 API） |
| 桶名 | `juese-assets` |
| 桶结构 | `releases/`（安装包 + `latest*.yml`）、根目录（VitePress 官网产物） |
| 存储费 | Free 套餐含 10GB；超出 ¥0.12 / GB / 月（安装包约 80MB × N 版本，可忽略） |
| 读写 | 内网回源免流量费，公网下载走 CDN |

::: tip 为什么选 Cloudflare R2
- **出站流量免费**：相比国内 OSS 按量计费，下载洪峰零成本
- **自带全球 CDN**：边缘节点加速，国内可用自定义域名
- **S3 兼容 API**：直接用 `@aws-sdk/client-s3`，无需专用 SDK
- **Free 套餐够用**：10GB 存储免费 + 出站免费
:::

### 3.2 CDN

| 项 | 建议 |
| --- | --- |
| 加速域名 | `cdn.juese.app` |
| 回源 | R2 桶 |
| 加速类型 | 静态网页 + 大文件下载 |
| 缓存策略 | 由源站 `Cache-Control` 头控制（`releases/*` 30 天 immutable；`*.html` 5 分钟） |
| 流量预估 | 单安装包 ~80MB，1000 次下载 ≈ 80GB；R2 出站免费 |

::: tip 成本大头是存储而非流量
R2 出站流量免费，存储费几乎可忽略。国内用户可选 Cloudflare CDN（自定义域名）或叠加国内 CDN 走大陆节点。
:::

## 四、数据库（MySQL 8.x）规格

| 项 | 标准生产 | 大规模 |
| --- | --- | --- |
| 实例 | 与应用同机（Docker 容器） | 独立实例（主从） |
| 规格 | 4C8G 共享 | 4C8G 专属 ×2（主从） |
| 磁盘 | 80G SSD（Docker named volume） | 200G SSD + 独立备份盘 |
| 连接池 | 应用端 `connectionLimit=10` | `connectionLimit=20` ×2 应用 |
| 字符集 | `utf8mb4` + `utf8mb4_unicode_ci` | 同左 |
| 备份 | 每日 `mysqldump` 到 `/data/backup/`，保留 14 天 | 每日全量 + binlog 增量，归档到 R2 |

::: warning 自动建表
启动后端服务时 `schema.ts` 会执行 `CREATE TABLE IF NOT EXISTS`（幂等），**无需手动建表**。本仓库另提供独立脚本 `server/sql/init.sql` 供预建库表使用。
:::

## 五、域名与证书

| 域名 | 类型 | 指向 | 用途 |
| --- | --- | --- | --- |
| `juese.app` | A / CNAME | R2 静态托管 / CDN | 官网入口 |
| `cdn.juese.app` | CNAME | CDN | 安装包、更新清单、官网静态资源 |
| `api.juese.app` | A | 应用服务器公网 IP | API + 管理后台 |
| `docs.juese.app`（可选） | CNAME | CDN | 文档站独立子域 |

- HTTPS：Let's Encrypt 免费证书，`certbot --nginx` 自动续期。
- 三个域名解析独立，便于流量拆分与故障隔离。

::: tip 测试环境可跳过域名
当前测试环境（`8.219.219.110`）用 IP + Nginx 直接托管 `releases/`，未配域名与 HTTPS。转正式环境时再启用域名与 CDN，详见 [部署运维 > 测试环境 vs 正式环境](/guide/deploy#_2-测试环境-vs-正式环境)。
:::

## 六、月度成本估算（标准生产档）

| 项 | 规格 | 月成本（估） |
| --- | --- | --- |
| 应用服务器 | 4C8G / 100G SSD / 5Mbps | ¥200 ~ ¥350 |
| R2 存储 | ~5GB（Free 套餐内） | ¥0 |
| CDN 流量 | ~50GB（约 600 次下载） | ¥0（R2 出站免费） |
| 域名 | 摊销 | ¥5 |
| HTTPS | Let's Encrypt | ¥0 |
| **合计** | | **¥205 ~ ¥355** |

::: tip 降本路径
- 用 Cloudflare R2 替代国内 OSS，下载流量费归零。
- 应用服务器选包年包月（较按量省 30%~50%）。
- 内测期用 2C4G 起步，监控 CPU > 70% 再升配。
:::

## 七、选型决策树

1. **用户 < 50，预算敏感** → 2C4G 应用服务器 + R2 Free 套餐 + Cloudflare CDN。
2. **用户 < 1000，国内为主** → 4C8G 应用服务器 + R2 + Cloudflare CDN（同机 MySQL Docker 容器）。
3. **用户 > 5000，或对可用性有要求** → 8C16G ×2 + SLB + 独立 MySQL 主从 + CDN 高配。

::: info 上线后扩容信号
- 应用服务器 CPU 持续 > 70% → 升配或加节点。
- API 响应 P95 > 500ms → 查慢查询、加索引或拆数据库。
- CDN 流量月增 > 30% → 确认是否异常下载，必要时升 CDN 套餐。
:::
