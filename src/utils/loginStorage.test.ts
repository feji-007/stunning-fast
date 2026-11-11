import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTO_LOGIN_TTL_MS,
  clearLoginStorage,
  decryptText,
  encryptText,
  getStoredLoginPreferences,
  isLoginStorageSupported,
  loadAutoLoginCredential,
  loadRememberedCredential,
  saveLoginPreferences
} from './loginStorage'

const REMEMBER_KEY = 'stunning-fast-login-remember'
const AUTO_KEY = 'stunning-fast-login-auto'

function createMemoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => {
      map.delete(key)
    },
    setItem: (key, value) => {
      map.set(key, String(value))
    }
  }
}

/** 模拟隐私模式：所有写入抛错，读取返回空 */
function createBlockedStorage(): Storage {
  return {
    length: 0,
    clear: () => {},
    getItem: () => null,
    key: () => null,
    removeItem: () => {},
    setItem: () => {
      throw new Error('storage disabled')
    }
  }
}

let local: Storage
let session: Storage

function installEnv(localStorageImpl: Storage = createMemoryStorage()) {
  local = localStorageImpl
  session = createMemoryStorage()
  vi.stubGlobal('window', { localStorage: local, sessionStorage: session, crypto: webcrypto })
  vi.stubGlobal('localStorage', local)
  vi.stubGlobal('sessionStorage', session)
  vi.stubGlobal('crypto', webcrypto)
}

beforeEach(() => {
  installEnv()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('登录信息本地存储', () => {
  it('加密：密文可还原，localStorage 中不出现明文密码', async () => {
    const cipher = await encryptText('Secret#123')
    expect(cipher.startsWith('v1.')).toBe(true)
    expect(cipher).not.toContain('Secret#123')
    await expect(decryptText(cipher)).resolves.toBe('Secret#123')

    await saveLoginPreferences('alice', 'Secret#123', { rememberPassword: true, autoLogin: false })
    const raw = local.getItem(REMEMBER_KEY)
    expect(raw).toBeTruthy()
    expect(raw as string).not.toContain('Secret#123')
    expect(JSON.parse(raw as string).username).toBe('alice')
  })

  it('场景一：只勾选「记住密码」——只写入记住密码记录，可自动填充', async () => {
    await saveLoginPreferences('alice', 'Secret#123', { rememberPassword: true, autoLogin: false })

    await expect(loadRememberedCredential()).resolves.toEqual({
      username: 'alice',
      password: 'Secret#123'
    })
    await expect(loadAutoLoginCredential()).resolves.toEqual({ status: 'none' })
    expect(local.getItem(AUTO_KEY)).toBeNull()
    expect(getStoredLoginPreferences()).toEqual({ rememberPassword: true, autoLogin: false })
  })

  it('场景二：只勾选「下次自动登录」——写入自动登录标识与 7 天有效期', async () => {
    const before = Date.now()
    await saveLoginPreferences('bob', 'Pwd#2024', { rememberPassword: false, autoLogin: true })

    const record = JSON.parse(local.getItem(AUTO_KEY) as string)
    expect(record.autoLogin).toBe(true)
    expect(record.username).toBe('bob')
    expect(record.expireAt - record.savedAt).toBe(AUTO_LOGIN_TTL_MS)
    expect(record.expireAt).toBeGreaterThanOrEqual(before + AUTO_LOGIN_TTL_MS)

    await expect(loadAutoLoginCredential()).resolves.toEqual({
      status: 'ok',
      username: 'bob',
      password: 'Pwd#2024'
    })
    expect(local.getItem(REMEMBER_KEY)).toBeNull()
  })

  it('场景三：双勾选——记住密码与自动登录记录同时存在', async () => {
    await saveLoginPreferences('carol', 'Pwd#9527', { rememberPassword: true, autoLogin: true })

    expect(local.getItem(REMEMBER_KEY)).toBeTruthy()
    expect(local.getItem(AUTO_KEY)).toBeTruthy()
    await expect(loadRememberedCredential()).resolves.toEqual({
      username: 'carol',
      password: 'Pwd#9527'
    })
    await expect(loadAutoLoginCredential()).resolves.toEqual({
      status: 'ok',
      username: 'carol',
      password: 'Pwd#9527'
    })
  })

  it('场景四：都不勾选——不写入任何记录，并清理历史记录', async () => {
    await saveLoginPreferences('dave', 'Pwd#1111', { rememberPassword: true, autoLogin: true })
    expect(local.length).toBeGreaterThan(0)

    await saveLoginPreferences('dave', 'Pwd#1111', { rememberPassword: false, autoLogin: false })
    expect(local.getItem(REMEMBER_KEY)).toBeNull()
    expect(local.getItem(AUTO_KEY)).toBeNull()
    await expect(loadRememberedCredential()).resolves.toBeNull()
  })

  it('场景五：自动登录过期——读取即失效并清除全部本地登录信息', async () => {
    await saveLoginPreferences('erin', 'Pwd#3333', { rememberPassword: true, autoLogin: true })

    const record = JSON.parse(local.getItem(AUTO_KEY) as string)
    record.expireAt = Date.now() - 1
    local.setItem(AUTO_KEY, JSON.stringify(record))

    await expect(loadAutoLoginCredential()).resolves.toEqual({ status: 'expired' })
    expect(local.getItem(AUTO_KEY)).toBeNull()
    expect(local.getItem(REMEMBER_KEY)).toBeNull()
    expect(getStoredLoginPreferences()).toEqual({ rememberPassword: false, autoLogin: false })
  })

  it('场景六：退出登录——清除账号、密码与自动登录标识', async () => {
    await saveLoginPreferences('frank', 'Pwd#4444', { rememberPassword: true, autoLogin: true })
    clearLoginStorage()

    expect(local.getItem(REMEMBER_KEY)).toBeNull()
    expect(local.getItem(AUTO_KEY)).toBeNull()
    await expect(loadRememberedCredential()).resolves.toBeNull()
    await expect(loadAutoLoginCredential()).resolves.toEqual({ status: 'none' })
  })

  it('降级：localStorage 不可用时禁用功能且不抛错、不影响登录', async () => {
    installEnv(createBlockedStorage())
    expect(isLoginStorageSupported()).toBe(false)

    await expect(
      saveLoginPreferences('grace', 'Pwd#5555', { rememberPassword: true, autoLogin: true })
    ).resolves.toBeUndefined()
    await expect(loadRememberedCredential()).resolves.toBeNull()
    await expect(loadAutoLoginCredential()).resolves.toEqual({ status: 'none' })
  })

  it('兼容：旧密文/被篡改的密文解密失败时不返回明文', async () => {
    await expect(decryptText('plain-password')).resolves.toBeNull()
    await expect(decryptText('v1.invalid.invalid')).resolves.toBeNull()
  })
})
