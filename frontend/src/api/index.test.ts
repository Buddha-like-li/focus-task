import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/secureStorage', () => ({
  loadAuthState: vi.fn(),
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

import { loadAuthState } from '@/utils/secureStorage'
import { ApiRequestError, getMe, listTaskAttachments, login } from './index'

const localServiceNetworkMessage = '无法连接 Focus Task 本地服务（http://127.0.0.1:18765）。请确认 Focus Task 服务容器正在运行后重试。'

describe('API network failures', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadAuthState).mockResolvedValue({ token: '', username: '' })
    fetchMock.mockRejectedValue(new TypeError('offline'))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses local-service guidance for a login request', async () => {
    await expect(login('tester', 'password')).rejects.toThrow(localServiceNetworkMessage)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:18765/api/auth/login',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('allows a new login request when restoring an old desktop session failed', async () => {
    vi.mocked(loadAuthState).mockRejectedValue(new Error('Credential Manager unavailable'))
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ detail: 'Incorrect username or password' }),
    })

    const error = await login('tester', 'password').catch(error => error)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(loadAuthState).not.toHaveBeenCalled()
  })

  it('uses the same direct service origin for attachments', async () => {
    await expect(listTaskAttachments(7)).rejects.toThrow(localServiceNetworkMessage)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:18765/api/tasks/7/attachments')
  })

  it('preserves an HTTP authentication status for startup session validation', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ detail: 'Could not validate credentials' }),
    })

    const error = await getMe().catch(error => error)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({ status: 401 })
  })
})
