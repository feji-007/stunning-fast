import { defineConfig } from 'vitepress'

// 下载分发基址：天翼云 ZOS 对象存储 bucket-5620/release/
const DOWNLOAD_BASE = 'https://bucket-5620.zhengzhou5.zos.ctyun.cn/release/'

export default defineConfig({
  lang: 'zh-CN',
  title: '绝色',
  description: '绝色 · AI 视频生成桌面助手，悬浮窗模式，多模型聚合',
  lastUpdated: true,
  cleanUrls: true,
  ignoreDeadLinks: [/^https?:\/\/localhost/],

  // 构建产物输出到 site/.vitepress/dist
  // 部署在 nginx 子路径 /docs/，base 必须与之一致
  base: '/docs/',

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '下载', link: '/download' },
      {
        text: '文档',
        items: [
          { text: '安装指南', link: '/guide/install' },
          { text: '使用指南', link: '/guide/usage' }
        ]
      },
      { text: '意见反馈', link: '/feedback' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: '快速开始',
          items: [
            { text: '安装指南', link: '/guide/install' },
            { text: '使用指南', link: '/guide/usage' }
          ]
        }
      ]
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/' }],

    footer: {
      message: '绝色 · AI 视频生成桌面助手',
      copyright: 'Copyright © 2026 绝色'
    },

    // 提供给 Markdown 下载按钮的环境变量
    downloadBase: DOWNLOAD_BASE
  }
})
