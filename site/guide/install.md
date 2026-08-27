# 安装指南

本指南面向最终用户与内部部署人员，覆盖桌面客户端与服务后台两部分的安装。

## 一、桌面客户端

1. 前往 [下载页](/download) 选择对应平台安装包。
2. Windows 双击 `.exe` 安装；macOS 拖拽 `.dmg`；Linux 赋予执行权限后运行 `.AppImage`。
3. 启动后客户端会自动连接后台服务 `http://localhost:4178`（可配置）。
   - 连接成功：拉取系统配置，未登录可浏览资源库；登录后同步个人配置。
   - 后台不可达：回退内置默认配置，UI 仍可浏览，但无法登录与同步。

## 二、服务后台

服务后台由三部分组成：后端 API、管理后台 Web UI、MySQL 数据库。详见 [部署运维](/guide/deploy)。

最小化本地体验：

```bash
# 1. 建库
mysql -u root -p -e "CREATE DATABASE stunning_fast CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 2. 启动后端（自动建表 + 种子数据 + 托管管理后台）
cd server
npm install
npm run admin:build   # 构建管理后台静态产物
npm run dev

# 3. 启动桌面客户端（项目根目录）
cd ..
npm run dev
```

启动后访问：

- 管理后台：http://localhost:4178/admin （账号 admin / admin123）
- API：http://localhost:4178/api
- 客户端：自动拉起 Electron 窗口