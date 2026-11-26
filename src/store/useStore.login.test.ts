import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      login: vi.fn(),
      loginEmail: vi.fn(),
      register: vi.fn(),
      me: vi.fn()
    },
    bootstrapApi: { fetch: vi.fn() },
    userApiKeysApi: { list: vi.fn(async () => ({ keys: [] })), save: vi.fn(), remove: vi.fn() },
    userConfigsApi: {
      list: vi.fn(async () => ({ configs: {} })),
      save: vi.fn(async () => ({}))
    }
  }
})

import { ApiError, authApi } from '../api/client'
import { AUTO_LOGIN_TTL_MS, loadAutoLoginCredential, loadRememberedCredential } from '../utils/loginStorage'

const TOKEN_KEY = 'stunning-fast-token'
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

let local: Storage
let session: Storage

function installEnv() {
  local = createMemoryStorage()
  session = createMemoryStorage()
  vi.stubGlobal('window', { localStorage: local, sessionStorage: session, crypto: webcrypto })
  vi.stubGlobal('localStorage', local)
  vi.stubGlobal('sessionStorage', session)
  vi.stubGlobal('crypto', webcrypto)
}

/** store 在模块加载时会读取 localStorage，因此先安装浏览器存储模拟再动态加载 */
installEnv()
const { useStore } = await import('./useStore')

function readAll(storage: Storage): string {
  const values: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key) values.push(`${key}=${storage.getItem(key) ?? ''}`)
  }
  return values.join('|')
}

beforeEach(() => {
  installEnv()
  vi.clearAllMocks()
  useStore.setState({
    user: { loggedIn: false, userId: null, username: '', token: '' },
    modal: 'none',
    keys: []
  })
  ;(authApi.login as Mock).mockResolvedValue({
    token: 'jwt-token',
    user: { id: 7, username: 'alice', role: 'user' }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('登录：记住密码 / 下次自动登录', () => {
  it('只勾选「记住密码」：写入加密后的账号密码，登录态仅当前会话有效', async () => {
    await useStore.getState().login('alice', 'Secret#123', {
      persistToken: false,
      prefs: { rememberPassword: true, autoLogin: false }
    })

    expect(useStore.getState().user.loggedIn).toBe(true)
    expect(session.getItem(TOKEN_KEY)).toBe('jwt-token')
    expect(local.getItem(TOKEN_KEY)).toBeNull()
    expect(readAll(local)).not.toContain('Secret#123')

    await expect(loadRememberedCredential()).resolves.toEqual({
      username: 'alice',
      password: 'Secret#123'
    })
    await expect(loadAutoLoginCredential()).resolves.toEqual({ status: 'none' })
  })

  it('勾选「下次自动登录」：token 持久化，自动登录记录 7 天内有效', async () => {
    await useStore.getState().login('alice', 'Secret#123', {
      persistToken: true,
      prefs: { rememberPassword: false, autoLogin: true }
    })

    expect(local.getItem(TOKEN_KEY)).toBe('jwt-token')
    expect(session.getItem(TOKEN_KEY)).toBeNull()
    const record = JSON.parse(local.getItem(AUTO_KEY) as string)
    expect(record.autoLogin).toBe(true)
    expect(record.expireAt - record.savedAt).toBe(AUTO_LOGIN_TTL_MS)
    await expect(loadAutoLoginCredential()).resolves.toEqual({
      status: 'ok',
      username: 'alice',
      password: 'Secret#123'
    })
  })

  it('双勾选：账号密码与自动登录标识同时持久化', async () => {
    await useStore.getState().login('alice', 'Secret#123', {
      persistToken: true,
      prefs: { rememberPassword: true, autoLogin: true }
    })

    expect(local.getItem(TOKEN_KEY)).toBe('jwt-token')
    expect(local.getItem(REMEMBER_KEY)).toBeTruthy()
    expect(local.getItem(AUTO_KEY)).toBeTruthy()
    await expect(loadRememberedCredential()).resolves.toEqual({
      username: 'alice',
      password: 'Secret#123'
    })
    await expect(loadAutoLoginCredential()).resolves.toEqual({
      status: 'ok',
      username: 'alice',
      password: 'Secret#123'
    })
  })

  it('不勾选任何选项：不写入记住密码与自动登录标识，但最近用户名(localStorage)与会话密码(sessionStorage)仍会记录', async () => {
    await useStore.getState().login('alice', 'Secret#123', {
      persistToken: false,
      prefs: { rememberPassword: false, autoLogin: false }
    })

    expect(useStore.getState().user.loggedIn).toBe(true)
    expect(session.getItem(TOKEN_KEY)).toBe('jwt-token')
    expect(local.getItem(TOKEN_KEY)).toBeNull()
    expect(local.getItem(REMEMBER_KEY)).toBeNull()
    expect(local.getItem(AUTO_KEY)).toBeNull()
    // 不依赖勾选框的最近用户名写在 localStorage（重启保留）
    expect(local.getItem(LAST_USERNAME_KEY)).toBe('alice')
    // 当前会话密码写在 sessionStorage（重启自动清空）
    expect(session.getItem(SESSION_CRED_KEY)).toBeTruthy()
    await expect(loadRememberedCredential()).resolves.toBeNull()
    await expect(loadAutoLoginCredential()).resolves.toEqual({ status: 'none' })
  })

  it('登录失败：不写入任何本地存储内容', async () => {
    ;(authApi.login as Mock).mockRejectedValue(new ApiError('用户名或密码错误', 401))

    await expect(
      useStore.getState().login('alice', 'wrong-password', {
        persistToken: true,
        prefs: { rememberPassword: true, autoLogin: true }
      })
    ).rejects.toThrow('用户名或密码错误')

    expect(useStore.getState().user.loggedIn).toBe(false)
    expect(local.getItem(TOKEN_KEY)).toBeNull()
    expect(session.getItem(TOKEN_KEY)).toBeNull()
    expect(local.getItem(REMEMBER_KEY)).toBeNull()
    expect(local.getItem(AUTO_KEY)).toBeNull()
  })

  it('主动退出登录：清自动登录标识 + 当前会话密码；记住密码 / 最近用户名保留', async () => {
    await useStore.getState().login('alice', 'Secret#123', {
      persistToken: true,
      prefs: { rememberPassword: true, autoLogin: true }
    })
    expect(local.getItem(AUTO_KEY)).toBeTruthy()
    expect(local.getItem(LAST_USERNAME_KEY)).toBe('alice')
    expect(session.getItem(SESSION_CRED_KEY)).toBeTruthy()

    useStore.getState().logout()

    expect(useStore.getState().user.loggedIn).toBe(false)
    expect(local.getItem(TOKEN_KEY)).toBeNull()
    expect(session.getItem(TOKEN_KEY)).toBeNull()
    // 自动登录标识清除（用户主动退出 = 不要再自动登录）
    expect(local.getItem(AUTO_KEY)).toBeNull()
    // 当前会话密码也清了（sessionStorage 侧）
    expect(session.getItem(SESSION_CRED_KEY)).toBeNull()
    // 记住密码 + 最近用户名保留，重启软件后只回填用户名；同会话内重新打开弹窗还能靠 REMEMBER_KEY 读到密码
    expect(local.getItem(REMEMBER_KEY)).toBeTruthy()
    expect(local.getItem(LAST_USERNAME_KEY)).toBe('alice')
    await expect(loadAutoLoginCredential()).resolves.toEqual({ status: 'none' })
    await expect(loadRememberedCredential()).resolves.toEqual({
      username: 'alice',
      password: 'Secret#123'
    })
  })
})
