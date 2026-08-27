import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 开发模式：Vite 独立服务在 5174，代理 /api 到后端 4178
// 生产模式：构建到 dist，由后端 Express 静态托管于 /admin
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:4178',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
