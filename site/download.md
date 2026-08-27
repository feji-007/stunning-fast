# 下载安装

::: tip 下载地址
所有安装包与自动更新清单（`latest.yml` / `latest-mac.yml` / `latest-linux.yml`）托管在 OSS + CDN。
下载基址：https://cdn.juese.app/releases/ （部署时替换为实际 CDN 地址）
:::

## Windows

- **在线安装器（推荐）**：[绝色-Setup-x.y.z.exe](https://cdn.juese.app/releases/juese-x.y.z-setup.exe)

  约 2 MB，运行后自动从 CDN 拉取完整程序（约 80 MB）并安装，**需联网**。完成后从开始菜单启动「绝色」。

::: tip 离线安装场景
在线安装器需联网。若需离线完整包，可在 `electron-builder.yml` 的 `win.target` 追加 `- target: nsis`（与 `nsis-web` 并存），同时生成完整 NSIS 安装包供离线分发。
:::

## macOS

- Intel：[绝色-x.y.z.dmg](https://cdn.juese.app/releases/juese-x.y.z.dmg)
- Apple Silicon：[绝色-x.y.z-arm64.dmg](https://cdn.juese.app/releases/juese-x.y.z-arm64.dmg)

打开 dmg 后将「绝色」拖入「应用程序」。首次启动若提示未验证，前往 系统设置 → 隐私与安全性 点击「仍要打开」。

## Linux

- AppImage：[绝色-x.y.z.AppImage](https://cdn.juese.app/releases/juese-x.y.z.AppImage)

```bash
chmod +x 绝色-*.AppImage
./绝色-*.AppImage
```

## 自动更新

安装版内置 electron-updater。客户端启动后会自动检测 CDN 上的 `latest.yml`，有新版本时静默下载并在下次启动应用更新。

::: warning 自定义更新源
企业内部部署可修改客户端打包配置中的 `publish.url`，指向私有 OSS 桶地址。
:::