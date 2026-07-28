import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
import { clearAuthState, loadAuthState, saveAuthState } from './secureStorage'

const TOKEN_KEY = 'focus-task-token'
const USERNAME_KEY = 'focus-task-username'

function setTauriRuntime(enabled: boolean) {
  if (enabled) {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    return
  }
  delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  delete (window as Window & { __TAURI__?: unknown }).__TAURI__
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

  it('uses Credential Manager in Tauri and clears legacy WebView credentials after saving', async () => {
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

  it('clears legacy WebView credentials even when Credential Manager rejects the save', async () => {
    setTauriRuntime(true)
    localStorage.setItem(TOKEN_KEY, 'legacy-token')
    localStorage.setItem(USERNAME_KEY, 'legacy-user')
    vi.mocked(invoke).mockRejectedValue(new Error('Credential Manager unavailable'))

    await expect(saveAuthState({ token: 'new-token', username: 'desktop-user' }))
      .rejects.toThrow('Credential Manager unavailable')

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(USERNAME_KEY)).toBeNull()
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
})
