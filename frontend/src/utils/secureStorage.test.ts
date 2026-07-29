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
import { clearAuthState, loadAuthState, saveAuthState } from './secureStorage'

const TOKEN_KEY = 'focus-task-token'
const USERNAME_KEY = 'focus-task-username'

function setTauriRuntime(enabled: boolean) {
  vi.mocked(isTauri).mockReturnValue(enabled)
}

describe('secureStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    setTauriRuntime(false)
  })

  afterEach(() => {
    setTauriRuntime(false)
    localStorage.clear()
  })

  it('uses browser storage only outside the Tauri desktop runtime', async () => {
    await saveAuthState({ token: 'browser-token', username: 'browser-user' })

    await expect(loadAuthState()).resolves.toEqual({
      token: 'browser-token',
      username: 'browser-user',
    })
    expect(invoke).not.toHaveBeenCalled()

    await clearAuthState()
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(USERNAME_KEY)).toBeNull()
  })

  it('uses Credential Manager when the official Tauri runtime marker is present', async () => {
    setTauriRuntime(true)
    localStorage.setItem(TOKEN_KEY, 'legacy-token')
    localStorage.setItem(USERNAME_KEY, 'legacy-user')
    vi.mocked(invoke).mockResolvedValue(undefined)

    await saveAuthState({ token: 'keyring-token', username: 'desktop-user' })

    expect(invoke).toHaveBeenCalledWith('save_auth_state', {
      state: { token: 'keyring-token', username: 'desktop-user' },
    })
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(USERNAME_KEY)).toBeNull()
  })

  it('shows a safe Chinese error and logs when Credential Manager rejects the save', async () => {
    setTauriRuntime(true)
    localStorage.setItem(TOKEN_KEY, 'legacy-token')
    localStorage.setItem(USERNAME_KEY, 'legacy-user')
    vi.mocked(invoke).mockRejectedValue(new Error('Credential Manager unavailable'))

    await expect(saveAuthState({ token: 'new-token', username: 'desktop-user' }))
      .rejects.toThrow('无法保存登录状态，请检查 Windows 凭据管理器后重试。')

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(USERNAME_KEY)).toBeNull()
    expect(appLogger.error).toHaveBeenCalledWith(
      '[认证] 无法写入 Windows 凭据管理器',
      expect.any(Error),
    )
  })

  it('never falls back to a stale WebView token when the desktop keyring has no session', async () => {
    setTauriRuntime(true)
    localStorage.setItem(TOKEN_KEY, 'stale-browser-token')
    localStorage.setItem(USERNAME_KEY, 'stale-browser-user')
    vi.mocked(invoke).mockResolvedValue(null)

    await expect(loadAuthState()).resolves.toEqual({ token: '', username: '' })
    expect(invoke).toHaveBeenCalledWith('load_auth_state')
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(USERNAME_KEY)).toBeNull()
  })

  it('records a Credential Manager read failure instead of silently treating it as a normal logout', async () => {
    setTauriRuntime(true)
    vi.mocked(invoke).mockRejectedValue(new Error('Credential Manager unavailable'))

    await expect(loadAuthState()).resolves.toEqual({ token: '', username: '' })

    expect(appLogger.warn).toHaveBeenCalledWith(
      '[认证] 无法从 Windows 凭据管理器恢复登录状态',
      expect.any(Error),
    )
  })

  it('rejects a manual logout when Credential Manager cannot clear the stored session', async () => {
    setTauriRuntime(true)
    vi.mocked(invoke).mockRejectedValue(new Error('Credential Manager unavailable'))

    await expect(clearAuthState()).rejects.toThrow('无法清除登录状态，请检查 Windows 凭据管理器后重试。')

    expect(appLogger.error).toHaveBeenCalledWith(
      '[认证] 无法清除 Windows 凭据管理器中的登录状态',
      expect.any(Error),
    )
  })
})
