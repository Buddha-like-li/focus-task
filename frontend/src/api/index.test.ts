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
import {
  ApiRequestError,
  getMe,
  listTaskAttachments,
  listTasks,
  listTrashTasks,
  login,
  onAuthExpired,
  permanentlyDeleteTask,
  promoteRequirement,
  restoreTrashTask,
  setAuthToken,
} from './index'

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
    onAuthExpired(null)
    setAuthToken(null)
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

  it('reports a delayed 401 with the token and session revision captured before account switch', async () => {
    let resolveResponse!: (response: Response) => void
    const slowResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve
    })
    const expired = vi.fn()
    onAuthExpired(expired)
    setAuthToken('token-a', 11)
    fetchMock.mockReturnValueOnce(slowResponse)

    const requestA = listTasks()
    // Account B is already active before A's original request finishes.
    setAuthToken('token-b', 13)
    resolveResponse({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ detail: 'Could not validate credentials' }),
    } as Response)

    await expect(requestA).rejects.toBeInstanceOf(ApiRequestError)
    await vi.waitFor(() => {
      expect(expired).toHaveBeenCalledWith({ token: 'token-a', sessionRevision: 11 })
    })
  })

  it('asks the local service to promote a requirement without creating a client task', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 12,
        client_id: 'promoted-task',
        quadrant: 2,
        title: '服务端创建的任务',
      }),
    })

    const task = await promoteRequirement(7, 2)

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:18765/api/requirements/7/promote',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ quadrant: 2 }) }),
    )
    expect(task).toMatchObject({ clientId: 'promoted-task', quadrant: 2 })
  })

  it('uses the dedicated garbage-bin endpoints without reusing the active-task list', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 7, client_id: 'trashed-task', deleted: true }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 7, client_id: 'trashed-task', deleted: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, permanently_deleted: true, cleanup_pending: true }),
      })

    const trashed = await listTrashTasks()
    const restored = await restoreTrashTask(7)
    const deletion = await permanentlyDeleteTask(7)

    expect(trashed).toMatchObject([{ id: 7, clientId: 'trashed-task', deleted: true }])
    expect(restored).toMatchObject({ id: 7, clientId: 'trashed-task', deleted: false })
    expect(deletion).toEqual({ ok: true, permanentlyDeleted: true, cleanupPending: true })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:18765/api/tasks/trash')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' })
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:18765/api/tasks/7/restore')
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' })
    expect(fetchMock.mock.calls[2]?.[0]).toBe('http://127.0.0.1:18765/api/tasks/7/permanent')
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: 'DELETE' })
  })
})
