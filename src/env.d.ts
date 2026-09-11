declare module '*.css'
declare module '*.png'
declare module '*.jpg'
declare module '*.jpeg'
declare module '*.svg'

interface ImportMetaEnv {
  /** 客户端连接的后端 API 基础地址，打包时通过 VITE_API_BASE_URL 覆盖（如 https://api.juese.app） */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
