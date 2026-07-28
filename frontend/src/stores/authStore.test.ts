import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api', () => ({
  getMe: vi.fn(),
  setAuthToken: vi.fn(),
  isAuthenticationFailure: vi.fn(),
}))

vi.mock('@/utils/secureStorage', () => ({
  clearAuthState: vi.fn(),
  loadAuthState: vi.fn(),
  saveAuthState: vi.fn(),
}))

import * as api from '@/api'
import { clearAuthState, loadAuthState } from '@/utils/secureStorage'
import { useAuthStore } from './authStore'

describe('stored service session validation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(loadAuthState).mockResolvedValue({ token: 'legacy-embedded-token', username: 'legacy-user' })
  })

  it('clears an old embedded-service token when the local service returns 401', async () => {
    vi.mocked(api.getMe).mockRejectedValue(new Error('Could not validate credentials'))
    vi.mocked(api.isAuthenticationFailure).mockReturnValue(true)

    const auth = useAuthStore()
    await auth.init()

    expect(auth.ready).toBe(true)
    expect(auth.isLoggedIn).toBe(false)
    expect(auth.token).toBe('')
    expect(auth.username).toBe('')
    expect(auth.userId).toBeNull()
    expect(api.setAuthToken).toHaveBeenNthCalledWith(1, 'legacy-embedded-token')
    expect(api.setAuthToken).toHaveBeenLastCalledWith(null)
    expect(clearAuthState).toHaveBeenCalledTimes(1)
  })

  it('keeps the saved session when the local service is temporarily unavailable', async () => {
    vi.mocked(api.getMe).mockRejectedValue(new Error('Failed to fetch'))
    vi.mocked(api.isAuthenticationFailure).mockReturnValue(false)

    const auth = useAuthStore()
    await auth.init()

    expect(auth.ready).toBe(true)
    expect(auth.isLoggedIn).toBe(true)
    expect(auth.token).toBe('legacy-embedded-token')
    expect(clearAuthState).not.toHaveBeenCalled()
  })
})
