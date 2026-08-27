import { defineConfig } from 'vitepress'

// 下载分发基址：打包产物上传到 OSS+CDN 后，替换为实际 CDN 地址。
// 例如 https://cdn.juese.app/releases/
const DOWNLOAD_BASE = 'https://cdn.juese.app/releases/'

export default defineConfig({
  lang: 'zh-CN',
  title: '绝色',
  description: '绝色 · AI 视频生成桌面助手，悬浮窗模式，多模型聚合',
  lastUpdated: true,
  cleanUrls: true,
  ignoreDeadLinks: [/^https?:\/\/localhost/],

  // 构建产物输出到 site/.vitepress/dist，上传到 OSS+CDN 根目录或子路径
  // 若部署在子路径，设置 base: '/docs/'
  base: '/',

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '下载', link: '/download' },
      {
        text: '文档',
        items: [
          { text: '安装指南', link: '/guide/install' },
          { text: '部署运维', link: '/guide/deploy' },
          { text: '服务器配置建议', link: '/guide/server-spec' },
          { text: 'Cloudflare 配置', link: '/guide/cloudflare-setup' },
          { text: 'API 接口', link: '/api/' }
        ]
      }
    ],

    sidebar: {
      '/guide/': [
        {
          text: '快速开始',
          items: [
            { text: '安装指南', link: '/guide/install' },
            { text: '部署运维', link: '/guide/deploy' },
            { text: '服务器配置建议', link: '/guide/server-spec' },
            { text: 'Cloudflare 配置', link: '/guide/cloudflare-setup' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'API 参考',
          items: [{ text: '接口总览', link: '/api/' }]
        }
      ]
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/' }],

    footer: {
      message: '基于 Electron + React + MySQL 构建',
      copyright: 'Copyright © 2026 绝色'
    },

    // 提供给 Markdown 下载按钮的环境变量
    downloadBase: DOWNLOAD_BASE
  }
})