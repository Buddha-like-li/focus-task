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
import { useTaskStore } from './taskStore'
import { useRequirementStore } from './requirementStore'
import { useTeamStore } from './teamStore'

describe('stored service session validation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(loadAuthState).mockResolvedValue({ token: 'legacy-embedded-token', username: 'legacy-user' })
    vi.mocked(clearAuthState).mockResolvedValue(undefined)
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

  it('returns to a signed-out state when an expired session cannot be removed from Credential Manager', async () => {
    vi.mocked(api.getMe).mockRejectedValue(new Error('Could not validate credentials'))
    vi.mocked(api.isAuthenticationFailure).mockReturnValue(true)
    vi.mocked(clearAuthState).mockRejectedValue(new Error('Credential Manager unavailable'))

    const auth = useAuthStore()
    await auth.init()

    expect(auth.ready).toBe(true)
    expect(auth.isLoggedIn).toBe(false)
    expect(auth.token).toBe('')
    expect(api.setAuthToken).toHaveBeenLastCalledWith(null)
  })

  it('clears persisted credentials and account-specific state before switching accounts', async () => {
    const auth = useAuthStore()
    const taskStore = useTaskStore()
    const requirementStore = useRequirementStore()
    const teamStore = useTeamStore()

    auth.token = 'service-token'
    auth.username = 'alice'
    auth.userId = 1
    auth.role = '管理'
    auth.isLoggedIn = true
    taskStore.tasks.push({
      id: 1,
      clientId: 'task-a',
      quadrant: 1,
      title: '账号 A 的任务',
      notes: '',
      done: false,
      startAt: '',
      due: '',
      tag: '',
      repeat: 'none',
      notifyOnStart: true,
      notifyOnDue: true,
      notifyOnOverdue: true,
      showInFocus: false,
      sortOrder: 0,
      doneAt: '',
      deleted: false,
    })
    requirementStore.requirements.push({
      id: 1,
      title: '账号 A 的需求',
      content: '',
      status: '待处理',
      priority: '中',
      sortOrder: 0,
      createdAt: '',
      updatedAt: '',
    })
    teamStore.team = { id: 1, name: '账号 A 的团队', creatorId: 1, createdAt: '', members: [] }

    await auth.logout()

    expect(clearAuthState).toHaveBeenCalledTimes(1)
    expect(auth.isLoggedIn).toBe(false)
    expect(auth.token).toBe('')
    expect(auth.username).toBe('')
    expect(taskStore.tasks).toEqual([])
    expect(requirementStore.requirements).toEqual([])
    expect(teamStore.team).toBeNull()
    expect(teamStore.members).toEqual([])
    expect(api.setAuthToken).toHaveBeenLastCalledWith(null)
  })

  it('keeps the active account when persisted credentials cannot be cleared', async () => {
    vi.mocked(clearAuthState).mockRejectedValue(new Error('无法清除登录状态'))
    const auth = useAuthStore()
    auth.token = 'service-token'
    auth.username = 'alice'
    auth.isLoggedIn = true

    await expect(auth.logout()).rejects.toThrow('无法清除登录状态')

    expect(auth.isLoggedIn).toBe(true)
    expect(auth.token).toBe('service-token')
    expect(auth.username).toBe('alice')
    expect(api.setAuthToken).not.toHaveBeenCalledWith(null)
  })
})
