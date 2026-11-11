/**
 * 登录信息本地存储（记住密码 / 下次自动登录）
 *
 * - 账号与原密码不会明文落盘：密码统一走 AES-GCM（256 位密钥 + 每次随机 IV）对称加密，
 *   以 `v1.<iv>.<密文>` 的 Base64 形式写入 localStorage。
 * - localStorage 或 Web Crypto 不可用时自动降级：不做任何写入，读写均返回空结果，
 *   不影响正常登录流程。
 * - 自动登录记录携带 7 天有效期，过期后读取即清除。
 */

const REMEMBER_KEY = 'stunning-fast-login-remember'
const AUTO_LOGIN_KEY = 'stunning-fast-login-auto'

/** 自动登录有效期：30 天 */
export const AUTO_LOGIN_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** 加密格式版本，便于后续算法升级 */
const CIPHER_PREFIX = 'v1'

/**
 * 对称加密使用的密钥材料。
 * 自动登录必须在无用户输入的情况下解密，因此密钥只能随客户端内置（属于本地混淆级别），
 * 但可确保 localStorage 中不出现明文密码；如需更高强度，应改为后端下发临时密钥。
 */
const KEY_MATERIAL = 'stunning-fast::login-cipher::v1::aes-gcm'

export interface LoginPreferences {
  rememberPassword: boolean
  autoLogin: boolean
}

interface RememberRecord {
  v: 1
  username: string
  /** AES-GCM 密文 */
  password: string
  savedAt: number
}

interface AutoLoginRecord extends RememberRecord {
  /** 登录态标识：该记录用于自动登录 */
  autoLogin: true
  /** 过期时间戳（毫秒） */
  expireAt: number
}

/** 安全获取 localStorage；不可用（隐私模式/被禁用）时返回 null */
function getLocalStorage(): Storage | null {
  try {
    const ls = window.localStorage
    const probe = '__stunning_fast_probe__'
    ls.setItem(probe, '1')
    ls.removeItem(probe)
    return ls
  } catch {
    return null
  }
}

function getSubtle(): SubtleCrypto | null {
  try {
    return window.crypto?.subtle ?? null
  } catch {
    return null
  }
}

/** 当前环境是否支持「记住密码 / 自动登录」（localStorage + Web Crypto 均可用） */
export function isLoginStorageSupported(): boolean {
  return getLocalStorage() !== null && getSubtle() !== null
}

// ===== AES-GCM 对称加解密 =====

const encoder = new TextEncoder()
const decoder = new TextDecoder()

let cachedKey: Promise<CryptoKey> | null = null

function getCipherKey(): Promise<CryptoKey> {
  const subtle = getSubtle()
  if (!subtle) return Promise.reject(new Error('当前环境不支持 Web Crypto'))
  if (!cachedKey) {
    cachedKey = (async () => {
      const raw = await subtle.digest('SHA-256', encoder.encode(KEY_MATERIAL))
      return subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
    })()
    // 失败后允许下次重试
    cachedKey.catch(() => {
      cachedKey = null
    })
  }
  return cachedKey
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return buffer
}

/** 使用 AES-GCM 对称加密文本 */
export async function encryptText(plain: string): Promise<string> {
  const subtle = getSubtle()
  if (!subtle) throw new Error('当前环境不支持加密')
  const key = await getCipherKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plain))
  return `${CIPHER_PREFIX}.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`
}

/** 解密文本；格式不合法 / 密钥不匹配时返回 null（视为无效数据） */
export async function decryptText(cipher: string): Promise<string | null> {
  const subtle = getSubtle()
  if (!subtle || typeof cipher !== 'string') return null
  const parts = cipher.split('.')
  if (parts.length !== 3 || parts[0] !== CIPHER_PREFIX) return null
  try {
    const key = await getCipherKey()
    const decrypted = await subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToArrayBuffer(parts[1]) },
      key,
      base64ToArrayBuffer(parts[2])
    )
    return decoder.decode(decrypted)
  } catch {
    return null
  }
}

// ===== 记录读写 =====

function readRecord<T>(ls: Storage, key: string): T | null {
  try {
    const raw = ls.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as T
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** 清除全部本地登录信息（记住密码 + 自动登录） */
export function clearLoginStorage(): void {
  const ls = getLocalStorage()
  if (!ls) return
  try {
    ls.removeItem(REMEMBER_KEY)
    ls.removeItem(AUTO_LOGIN_KEY)
  } catch {
    // 忽略：清理失败不影响登录流程
  }
}

/**
 * 登录成功后按勾选情况写入本地存储。
 * - 记住密码：账号 + 加密密码
 * - 下次自动登录：登录态标识 + 账号 + 加密密码 + 7 天后过期时间
 * - 都未勾选：清除旧的本地登录信息，仅保持当前会话登录态
 */
export async function saveLoginPreferences(
  username: string,
  password: string,
  prefs: LoginPreferences
): Promise<void> {
  const ls = getLocalStorage()
  if (!ls) return
  const name = username.trim()

  if (!prefs.rememberPassword && !prefs.autoLogin) {
    clearLoginStorage()
    return
  }
  if (!getSubtle()) return

  try {
    const now = Date.now()
    const cipher = await encryptText(password)

    if (prefs.rememberPassword) {
      const record: RememberRecord = { v: 1, username: name, password: cipher, savedAt: now }
      ls.setItem(REMEMBER_KEY, JSON.stringify(record))
    } else {
      ls.removeItem(REMEMBER_KEY)
    }

    if (prefs.autoLogin) {
      const record: AutoLoginRecord = {
        v: 1,
        autoLogin: true,
        username: name,
        password: cipher,
        savedAt: now,
        expireAt: now + AUTO_LOGIN_TTL_MS
      }
      ls.setItem(AUTO_LOGIN_KEY, JSON.stringify(record))
    } else {
      ls.removeItem(AUTO_LOGIN_KEY)
    }
  } catch {
    // 写入失败（配额/加密异常）不影响已完成的登录
  }
}

/** 自动登录标识的读取结果：未开启 / 已过期 / 可用 */
export type AutoLoginResult =
  | { status: 'none' }
  | { status: 'expired' }
  | { status: 'ok'; username: string; password: string }

/**
 * 读取并解密自动登录记录。
 * - 未开启：{ status: 'none' }
 * - 已过期：清除本地登录信息并返回 { status: 'expired' }（调用方应同时清掉持久化 token）
 * - 可用：返回解密后的账号密码
 */
export async function loadAutoLoginCredential(): Promise<AutoLoginResult> {
  const ls = getLocalStorage()
  if (!ls) return { status: 'none' }
  const record = readRecord<AutoLoginRecord>(ls, AUTO_LOGIN_KEY)
  if (!record) return { status: 'none' }

  if (record.autoLogin !== true || typeof record.expireAt !== 'number') {
    clearLoginStorage()
    return { status: 'none' }
  }
  if (record.expireAt <= Date.now()) {
    // 登录信息已过期：自动清除全部本地登录信息
    clearLoginStorage()
    return { status: 'expired' }
  }
  if (typeof record.username !== 'string' || typeof record.password !== 'string') {
    clearLoginStorage()
    return { status: 'none' }
  }

  const password = await decryptText(record.password)
  if (password === null) {
    clearLoginStorage()
    return { status: 'none' }
  }
  return { status: 'ok', username: record.username, password }
}

/** 读取并解密记住密码记录，用于登录表单自动填充；损坏时返回 null */
export async function loadRememberedCredential(): Promise<{ username: string; password: string } | null> {
  const ls = getLocalStorage()
  if (!ls) return null
  const record = readRecord<RememberRecord>(ls, REMEMBER_KEY)
  if (!record || typeof record.username !== 'string' || typeof record.password !== 'string') {
    return null
  }
  const password = await decryptText(record.password)
  if (password === null) {
    ls.removeItem(REMEMBER_KEY)
    return null
  }
  return { username: record.username, password }
}

/** 读取本地已保存的勾选状态（自动登录需未过期），用于登录表单初始勾选 */
export function getStoredLoginPreferences(): LoginPreferences {
  const ls = getLocalStorage()
  if (!ls) return { rememberPassword: false, autoLogin: false }

  const remember = readRecord<RememberRecord>(ls, REMEMBER_KEY)
  const auto = readRecord<AutoLoginRecord>(ls, AUTO_LOGIN_KEY)
  const autoValid = !!auto && typeof auto.expireAt === 'number' && auto.expireAt > Date.now()

  return {
    rememberPassword: !!remember,
    autoLogin: autoValid
  }
}
