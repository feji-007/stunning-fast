# 下载安装

::: tip 下载地址
所有安装包与自动更新清单（`latest.yml` / `latest-mac.yml` / `latest-linux.yml`）托管在天翼云 ZOS 对象存储。
下载基址：`https://bucket-5620.zhengzhou5.zos.ctyun.cn/release/`
:::

## Windows

<!-- AUTO-GENERATED-DOWNLOADS:START -->
- **在线安装器（推荐）：**[下载](https://bucket-5620.zhengzhou5.zos.ctyun.cn/release/juese-1.0.0-setup.exe)

  约 2 MB，运行后自动从 CDN 拉取完整程序（约 80 MB）并安装，**需联网**。完成后从开始菜单启动「绝色」。

## macOS

- **Intel：**本次未生成
- **Apple Silicon：**本次未生成

## Linux

- **AppImage：**本次未生成
<!-- AUTO-GENERATED-DOWNLOADS:END -->

::: tip 离线安装场景
在线安装器需联网。若需离线完整包，可在 `electron-builder.yml` 的 `win.target` 追加 `- target: nsis`（与 `nsis-web` 并存），同时生成完整 NSIS 安装包供离线分发。
:::

打开 dmg 后将「绝色」拖入「应用程序」。首次启动若提示未验证，前往 系统设置 → 隐私与安全性 点击「仍要打开」。

```bash
chmod +x 绝色-*.AppImage
./绝色-*.AppImage
```

## 自动更新

安装版内置 electron-updater。客户端启动后会自动检测 CDN 上的 `latest.yml`，有新版本时静默下载并在下次启动应用更新。

::: warning 自定义更新源
企业内部部署可修改客户端打包配置中的 `publish.url`，指向私有对象存储桶或内网 Nginx 静态服务地址（协议兼容 generic provider）。
:::

::: tip 存储方案
当前安装包托管在天翼云 ZOS 对象存储（`bucket-5620/release/`），客户端启动后从该地址拉取 `latest.yml` 检测更新。后续可绑定自定义 CDN 域名加速，详见 [部署运维](/guide/deploy)。
:::
