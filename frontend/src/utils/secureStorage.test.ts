import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}))

vi.mock('@/composables/useAppLogger', () => ({
  appLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    buffer: vi.fn(),
  },
}))

import { invoke, isTauri } from '@tauri-apps/api/core'
import { appLogger } from '@/composables/useAppLogger'
import {
  clearAuthState,
  deactivateAuthState,
  listAuthAccounts,
  loadAuthState,
  removeAuthAccount,
  restoreAuthAccount,
  saveAuthState,
} from './secureStorage'

const TOKEN_KEY = 'focus-task-token'
const USERNAME_KEY = 'focus-task-username'
const REMEMBERED_USERNAME_KEY = 'focus-task-remembered-username'

function setTauriRuntime(enabled: boolean) {
  vi.mocked(isTauri).mockReturnValue(enabled)
}

describe('安全登录状态存储', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    setTauriRuntime(false)
  })

  afterEach(() => {
    setTauriRuntime(false)
    localStorage.clear()
  })

  it('仅在浏览器开发模式使用浏览器存储，并保留账号名用于下次填写', async () => {
    await saveAuthState({ token: 'browser-token', username: 'browser-user' })

    await expect(loadAuthState()).resolves.toEqual({
      token: 'browser-token',
      username: 'browser-user',
    })
    await expect(listAuthAccounts()).resolves.toEqual([{
      username: 'browser-user',
      hasSession: true,
      isActive: true,
    }])
    expect(invoke).not.toHaveBeenCalled()

    await clearAuthState('browser-user')
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(USERNAME_KEY)).toBeNull()
    expect(localStorage.getItem(REMEMBERED_USERNAME_KEY)).toBe('browser-user')
  })

  it('在桌面端通过原生命令保存会话，并清除旧 WebView 数据', async () => {
    setTauriRuntime(true)
    localStorage.setItem(TOKEN_KEY, 'legacy-token')
    localStorage.setItem(USERNAME_KEY, 'legacy-user')
    localStorage.setItem(REMEMBERED_USERNAME_KEY, 'legacy-user')
    vi.mocked(invoke).mockResolvedValue(undefined)

    await saveAuthState({ token: 'native-token', username: 'desktop-user' })

    expect(invoke).toHaveBeenCalledWith('save_auth_state', {
      state: { token: 'native-token', username: 'desktop-user' },
    })
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(USERNAME_KEY)).toBeNull()
    expect(localStorage.getItem(REMEMBERED_USERNAME_KEY)).toBeNull()
  })

  it('列出、恢复、停用及移除桌面端记住的账号时使用约定的原生命令', async () => {
    setTauriRuntime(true)
    vi.mocked(invoke)
      .mockResolvedValueOnce([
        { username: 'alice', hasSession: true, isActive: true },
        { username: 'bob', hasSession: false, isActive: false },
      ])
      .mockResolvedValueOnce({ token: 'alice-token', username: 'alice' })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)

    await expect(listAuthAccounts()).resolves.toEqual([
      { username: 'alice', hasSession: true, isActive: true },
      { username: 'bob', hasSession: false, isActive: false },
    ])
    await expect(restoreAuthAccount(' alice ')).resolves.toEqual({ token: 'alice-token', username: 'alice' })
    await deactivateAuthState()
    await clearAuthState('alice')
    await removeAuthAccount('alice')

    expect(invoke).toHaveBeenNthCalledWith(1, 'list_auth_accounts')
    expect(invoke).toHaveBeenNthCalledWith(2, 'restore_auth_account', { username: 'alice' })
    expect(invoke).toHaveBeenNthCalledWith(3, 'deactivate_auth_state')
    expect(invoke).toHaveBeenNthCalledWith(4, 'clear_auth_state', { username: 'alice' })
    expect(invoke).toHaveBeenNthCalledWith(5, 'remove_auth_account', { username: 'alice' })
  })

  it('不让桌面端回退到遗留浏览器令牌', async () => {
    setTauriRuntime(true)
    localStorage.setItem(TOKEN_KEY, 'stale-browser-token')
    localStorage.setItem(USERNAME_KEY, 'stale-browser-user')
    vi.mocked(invoke).mockResolvedValue(null)

    await expect(loadAuthState()).resolves.toEqual({ token: '', username: '' })
    expect(invoke).toHaveBeenCalledWith('load_auth_state')
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(USERNAME_KEY)).toBeNull()
  })

  it('在原生保存失败时只记录安全错误，不记录令牌', async () => {
    setTauriRuntime(true)
    vi.mocked(invoke).mockRejectedValue(new Error('native storage unavailable'))

    await expect(saveAuthState({ token: 'new-token', username: 'desktop-user' }))
      .rejects.toThrow('无法保存登录状态，请稍后重试。')

    expect(appLogger.error).toHaveBeenCalledWith(
      '[认证] 无法保存本机登录状态',
      expect.any(Error),
    )
    expect(JSON.stringify(vi.mocked(appLogger.error).mock.calls)).not.toContain('new-token')
  })

  it('为原生读取、恢复和清除失败提供中文提示', async () => {
    setTauriRuntime(true)
    vi.mocked(invoke).mockRejectedValue(new Error('native storage unavailable'))

    await expect(loadAuthState()).rejects.toThrow('无法读取已保存的登录状态，请稍后重试。')
    await expect(listAuthAccounts()).rejects.toThrow('无法读取已记住的账号，请稍后重试。')
    await expect(restoreAuthAccount('alice')).rejects.toThrow('无法恢复所选账号的登录状态，请稍后重试。')
    await expect(clearAuthState()).rejects.toThrow('无法清除登录状态，请稍后重试。')
    await expect(deactivateAuthState()).rejects.toThrow('无法切换账号，请稍后重试。')
    await expect(removeAuthAccount('alice')).rejects.toThrow('无法移除已记住的账号，请稍后重试。')
  })
})
