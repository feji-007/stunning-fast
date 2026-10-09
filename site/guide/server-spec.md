# 服务器配置建议

本页给出部署「绝色」整套服务（后端 API + 管理后台 + 数据库 + 官网/下载分发）的硬件选型建议，按用户规模分档，可直接照搬下单。

::: tip 架构原则
**应用服务器**（Docker Compose）扛计算与数据库，**天翼云 ZOS** 扛下载与静态资源带宽，两者解耦后可独立扩容。下载洪峰绝不冲击业务接口。
:::

## 一、分档速查

| 规模 | 应用服务器 | 数据库 | 天翼云 ZOS | 月成本（估） |
| --- | --- | --- | --- | --- |
| 个人 / 内测（≤ 50 人） | 2C4G / 60G SSD | 与应用同机 MySQL（Docker 容器） | ZOS 按量 | ¥80 ~ ¥200 |
| 标准生产（≤ 1000 人） | 4C8G / 100G SSD | 与应用同机 MySQL（Docker 容器） | ZOS 按量 | ¥250 ~ ¥600 |
| 中大规模（≥ 5000 人） | 8C16G ×2 + SLB | 独立 MySQL 主从 | ZOS 按量 + 可叠加 CDN | ¥1200 ~ ¥3000 |

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
应用服务器只跑 API（请求小、响应快），下载流量全部走天翼云 ZOS。5 Mbps 足够支撑千级日活的 API 调用；带宽瓶颈由 ZOS 承接。
:::

::: tip Docker 部署
应用服务器无需手动装 Node.js / MySQL / Nginx——Docker Compose 一键拉起 `mysql` / `server` / `nginx` 三容器，数据持久化到 named volume。详见 [部署运维](/guide/deploy)。
:::

## 三、天翼云 ZOS 对象存储配置

| 项 | 建议 |
| --- | --- |
| 选型 | 天翼云 ZOS（国内节点低延迟，S3 兼容 API） |
| 桶名 | `bucket-5620` |
| 外网 endpoint | `https://zhengzhou5.zos.ctyun.cn` |
| 公开访问基址 | `https://bucket-5620.zhengzhou5.zos.ctyun.cn` |
| 桶结构 | `release/`（安装包 + `latest*.yml`）、根目录或 `site/`（VitePress 官网产物） |
| 缓存策略 | 由源站 `Cache-Control` 头控制（`release/*.yml`、`*.html` 5 分钟；其余 30 天 immutable） |
| 流量预估 | 单安装包 ~80MB，1000 次下载 ≈ 80GB；按 ZOS 出站流量计费 |

::: tip 为什么选天翼云 ZOS
- **国内节点低延迟**：郑州等国内资源池，国内用户访问稳定
- **S3 兼容 API**：直接用 `@aws-sdk/client-s3`，无需专用 SDK
- **按量计费**：存储与流量分开计费，小项目起步成本低
- **可叠加 CDN**：用户量上来后可绑定 CDN 进一步降本加速
:::

## 四、数据库（MySQL 8.x）规格

| 项 | 标准生产 | 大规模 |
| --- | --- | --- |
| 实例 | 与应用同机（Docker 容器） | 独立实例（主从） |
| 规格 | 4C8G 共享 | 4C8G 专属 ×2（主从） |
| 磁盘 | 80G SSD（Docker named volume） | 200G SSD + 独立备份盘 |
| 连接池 | 应用端 `connectionLimit=10` | `connectionLimit=20` ×2 应用 |
| 字符集 | `utf8mb4` + `utf8mb4_unicode_ci` | 同左 |
| 备份 | 每日 `mysqldump` 到 `/data/backup/`，保留 14 天 | 每日全量 + binlog 增量，归档到 ZOS |

::: warning 自动建表
启动后端服务时 `schema.ts` 会执行 `CREATE TABLE IF NOT EXISTS`（幂等），**无需手动建表**。本仓库另提供独立脚本 `server/sql/init.sql` 供预建库表使用。
:::

## 五、域名与证书

| 域名 | 类型 | 指向 | 用途 |
| --- | --- | --- | --- |
| `jueseai.com` | A | 应用服务器公网 IP | 官网 + API + 管理后台（备案后） |
| `cdn.jueseai.com`（可选） | CNAME | ZOS / CDN | 安装包、更新清单、官网静态资源 |

- HTTPS：Let's Encrypt 免费证书，`certbot --nginx` 自动续期。
- 未备案前用 IP + Nginx 端口（如 `90`）访问；备案完成后再绑定域名。

::: tip 测试环境可跳过域名
当前测试环境（`1.194.28.136`）后端服务用 IP + Nginx 访问；安装包分发走天翼云 ZOS 对象存储（`bucket-5620/release/`），无需占用服务器带宽。`jueseai.com` 完成 ICP 备案后可绑定域名与 HTTPS，详见 [部署运维](/guide/deploy)。
:::

## 六、月度成本估算（标准生产档）

| 项 | 规格 | 月成本（估） |
| --- | --- | --- |
| 应用服务器 | 4C8G / 100G SSD / 5Mbps | ¥200 ~ ¥350 |
| 天翼云 ZOS 存储 | ~5GB | ¥1 ~ ¥5 |
| ZOS 出站流量 | ~50GB（约 600 次下载） | ¥10 ~ ¥30 |
| 域名 | 摊销 | ¥5 |
| HTTPS | Let's Encrypt | ¥0 |
| **合计** | | **¥216 ~ ¥390** |

::: tip 降本路径
- 下载流量走天翼云 ZOS，应用服务器带宽只跑 API，可压到 3 Mbps。
- 应用服务器选包年包月（较按量省 30%~50%）。
- 内测期用 2C4G 起步，监控 CPU > 70% 再升配。
- 用户量上来后可在 ZOS 前叠加 CDN，进一步降低单次下载成本。
:::

## 七、选型决策树

1. **用户 < 50，预算敏感** → 2C4G 应用服务器 + ZOS 按量计费（同机 MySQL Docker 容器）。
2. **用户 < 1000，国内为主** → 4C8G 应用服务器 + ZOS 按量计费（同机 MySQL Docker 容器）。
3. **用户 > 5000，或对可用性有要求** → 8C16G ×2 + SLB + 独立 MySQL 主从 + ZOS + CDN。

::: info 上线后扩容信号
- 应用服务器 CPU 持续 > 70% → 升配或加节点。
- API 响应 P95 > 500ms → 查慢查询、加索引或拆数据库。
- ZOS 流量月增 > 30% → 确认是否异常下载，必要时绑定 CDN 进一步降本。
:::
