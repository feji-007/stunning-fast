import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTO_LOGIN_TTL_MS,
  clearAllLoginStorage,
  clearLoginStorage,
  decryptText,
  encryptText,
  getStoredLoginPreferences,
  isLoginStorageSupported,
  loadAutoLoginCredential,
  loadLastUsername,
  loadLastUsedCredential,
  loadRememberedCredential,
  loadSessionPassword,
  saveLastUsername,
  saveLoginPreferences,
  saveSessionPassword
} from './loginStorage'

const REMEMBER_KEY = 'stunning-fast-login-remember'
const AUTO_KEY = 'stunning-fast-login-auto'
const LAST_USERNAME_KEY = 'stunning-fast-login-last-username'
const SESSION_CRED_KEY = 'stunning-fast-login-session-password'

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

  it('场景二：只勾选「下次自动登录」——写入自动登录标识与 30 天有效期', async () => {
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

  it('场景四：都不勾选——不写入记住密码 / 自动登录记录', async () => {
    await saveLoginPreferences('dave', 'Pwd#1111', { rememberPassword: true, autoLogin: true })
    expect(local.length).toBeGreaterThan(0)

    await saveLoginPreferences('dave', 'Pwd#1111', { rememberPassword: false, autoLogin: false })
    expect(local.getItem(REMEMBER_KEY)).toBeNull()
    expect(local.getItem(AUTO_KEY)).toBeNull()
    await expect(loadRememberedCredential()).resolves.toBeNull()
  })

  it('场景五：自动登录过期——仅清自动登录标识；记住密码 / 最近用户名保留', async () => {
    await saveLoginPreferences('erin', 'Pwd#3333', { rememberPassword: true, autoLogin: true })
    saveLastUsername('erin')
    await saveSessionPassword('Pwd#3333')

    const record = JSON.parse(local.getItem(AUTO_KEY) as string)
    record.expireAt = Date.now() - 1
    local.setItem(AUTO_KEY, JSON.stringify(record))

    await expect(loadAutoLoginCredential()).resolves.toEqual({ status: 'expired' })
    expect(local.getItem(AUTO_KEY)).toBeNull()
    // 记住密码 / 最近用户名保留（密码因为是 remember 勾选的所以还在）
    expect(local.getItem(REMEMBER_KEY)).toBeTruthy()
    expect(local.getItem(LAST_USERNAME_KEY)).toBe('erin')
    await expect(loadRememberedCredential()).resolves.toEqual({
      username: 'erin',
      password: 'Pwd#3333'
    })
    // 会话密码也被 clearLoginStorage 清掉了
    expect(session.getItem(SESSION_CRED_KEY)).toBeNull()
    expect(getStoredLoginPreferences()).toEqual({ rememberPassword: true, autoLogin: false })
  })

  it('场景六：退出登录（clearLoginStorage）——清自动登录 + 当前会话密码；记住密码 / 最近用户名保留', async () => {
    await saveLoginPreferences('frank', 'Pwd#4444', { rememberPassword: true, autoLogin: true })
    saveLastUsername('frank')
    await saveSessionPassword('Pwd#4444')

    clearLoginStorage()

    expect(local.getItem(AUTO_KEY)).toBeNull()
    expect(session.getItem(SESSION_CRED_KEY)).toBeNull()
    // REMEMBER_KEY / LAST_USERNAME_KEY 保留，下次打开登录弹窗还能回填
    expect(local.getItem(REMEMBER_KEY)).toBeTruthy()
    expect(local.getItem(LAST_USERNAME_KEY)).toBe('frank')
    await expect(loadAutoLoginCredential()).resolves.toEqual({ status: 'none' })
    await expect(loadRememberedCredential()).resolves.toEqual({
      username: 'frank',
      password: 'Pwd#4444'
    })
  })

  it('场景七：显式清除全部（clearAllLoginStorage）——记住密码 / 自动登录 / 最近用户名 / 会话密码 全部清空', async () => {
    await saveLoginPreferences('grace', 'Pwd#5555', { rememberPassword: true, autoLogin: true })
    saveLastUsername('grace')
    await saveSessionPassword('Pwd#5555')

    clearAllLoginStorage()

    expect(local.getItem(REMEMBER_KEY)).toBeNull()
    expect(local.getItem(AUTO_KEY)).toBeNull()
    expect(local.getItem(LAST_USERNAME_KEY)).toBeNull()
    expect(session.getItem(SESSION_CRED_KEY)).toBeNull()
    await expect(loadRememberedCredential()).resolves.toBeNull()
    await expect(loadAutoLoginCredential()).resolves.toEqual({ status: 'none' })
    await expect(loadSessionPassword()).resolves.toBeNull()
  })

  it('场景八：退出登录后（同会话）重开——能回填用户名 + 密码；重启后只回填用户名', async () => {
    // 模拟一次登录：既没有勾选记住密码，也没有勾选自动登录
    saveLastUsername('heidi')
    await saveSessionPassword('Pwd#6666')
    // 没有 REMEMBER_KEY（因为没勾选）

    // 同会话内退出登录 → 重新打开登录弹窗
    expect(loadLastUsername()).toBe('heidi')
    await expect(loadSessionPassword()).resolves.toBe('Pwd#6666')
    await expect(loadLastUsedCredential()).resolves.toEqual({
      username: 'heidi',
      password: 'Pwd#6666'
    })

    // 用户退出登录
    clearLoginStorage()
    expect(loadLastUsername()).toBe('heidi') // 用户名还在
    await expect(loadSessionPassword()).resolves.toBeNull() // 密码被清（但如果还在同会话没退出的话，上面 clearLoginStorage 里清了 SESSION_CRED_KEY）

    // 模拟"重启软件"：sessionStorage 清空、localStorage 保留
    session.clear()
    expect(loadLastUsername()).toBe('heidi') // 用户名还在
    await expect(loadSessionPassword()).resolves.toBeNull() // 密码随 sessionStorage 消失
    await expect(loadLastUsedCredential()).resolves.toEqual({
      username: 'heidi',
      password: ''
    })
  })

  it('场景九：邮箱验证码登录——只存 username，不存 password', async () => {
    saveLastUsername('heidi@example.com')
    // 不调用 saveSessionPassword（邮箱验证码场景无持久密码）

    expect(loadLastUsername()).toBe('heidi@example.com')
    await expect(loadSessionPassword()).resolves.toBeNull()
    const loaded = await loadLastUsedCredential()
    expect(loaded?.username).toBe('heidi@example.com')
    expect(loaded?.password).toBe('')
  })

  it('降级：localStorage 不可用时禁用功能且不抛错、不影响登录', async () => {
    installEnv(createBlockedStorage())
    expect(isLoginStorageSupported()).toBe(false)

    await expect(
      saveLoginPreferences('grace', 'Pwd#5555', { rememberPassword: true, autoLogin: true })
    ).resolves.toBeUndefined()
    saveLastUsername('grace')
    await saveSessionPassword('Pwd#5555')
    await expect(loadRememberedCredential()).resolves.toBeNull()
    await expect(loadAutoLoginCredential()).resolves.toEqual({ status: 'none' })
  })

  it('兼容：旧密文/被篡改的密文解密失败时不返回明文', async () => {
    await expect(decryptText('plain-password')).resolves.toBeNull()
    await expect(decryptText('v1.invalid.invalid')).resolves.toBeNull()
  })
})
