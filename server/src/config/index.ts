import dotenv from 'dotenv'

dotenv.config()

function required(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback
  if (v === undefined) {
    throw new Error(`[config] 缺少环境变量: ${key}，请在 .env 中配置（参考 .env.example）`)
  }
  return v
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

export const config = {
  port: Number(optional('PORT', '4178')),
  databaseUrl: required('DATABASE_URL', 'mysql://root:123456@localhost:3306/stunning_fast'),
  jwtSecret: required('JWT_SECRET', 'stunning-fast-dev-secret-change-me'),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '7d'),
  adminUsername: optional('ADMIN_USERNAME', 'admin'),
  adminPassword: optional('ADMIN_PASSWORD', 'admin123'),
  corsOrigin: optional('CORS_ORIGIN', '*'),
  clientApiBase: optional('CLIENT_API_BASE', 'http://localhost:4178'),
  nodeEnv: optional('NODE_ENV', 'development'),
  isDev: optional('NODE_ENV', 'development') === 'development'
} as const

export type AppConfig = typeof config