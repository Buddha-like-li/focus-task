import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api', () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  setAuthToken: vi.fn(),
  isAuthenticationFailure: vi.fn(),
}))

vi.mock('@/utils/secureStorage', () => ({
  clearAuthState: vi.fn(),
  deactivateAuthState: vi.fn(),
  listAuthAccounts: vi.fn(),
  loadAuthState: vi.fn(),
  removeAuthAccount: vi.fn(),
  restoreAuthAccount: vi.fn(),
  saveAuthState: vi.fn(),
}))

import * as api from '@/api'
import {
  clearAuthState,
  deactivateAuthState,
  listAuthAccounts,
  loadAuthState,
  removeAuthAccount,
  restoreAuthAccount,
  saveAuthState,
} from '@/utils/secureStorage'
import { useAuthStore } from './authStore'
import { useTaskStore } from './taskStore'
import { useRequirementStore } from './requirementStore'
import { useTeamStore } from './teamStore'
import { useTrashStore } from './trashStore'

describe('账号会话恢复与切换', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(loadAuthState).mockResolvedValue({ token: 'legacy-embedded-token', username: 'legacy-user' })
    vi.mocked(clearAuthState).mockResolvedValue(undefined)
    vi.mocked(deactivateAuthState).mockResolvedValue(undefined)
    vi.mocked(removeAuthAccount).mockResolvedValue(undefined)
    vi.mocked(restoreAuthAccount).mockResolvedValue(null)
    vi.mocked(saveAuthState).mockResolvedValue(undefined)
    vi.mocked(listAuthAccounts).mockResolvedValue([])
  })

  it('在服务返回 401 时只删除过期账号的会话，并保留用户名以便重新输入密码', async () => {
    vi.mocked(api.getMe).mockRejectedValue(new Error('Could not validate credentials'))
    vi.mocked(api.isAuthenticationFailure).mockReturnValue(true)

    const auth = useAuthStore()
    await auth.init()

    expect(auth.ready).toBe(true)
    expect(auth.isLoggedIn).toBe(false)
    expect(auth.token).toBe('')
    expect(auth.username).toBe('')
    expect(auth.loginUsernameHint).toBe('legacy-user')
    expect(api.setAuthToken).toHaveBeenNthCalledWith(1, 'legacy-embedded-token', expect.any(Number))
    expect(api.setAuthToken).toHaveBeenLastCalledWith(null, expect.any(Number))
    expect(clearAuthState).toHaveBeenCalledWith('legacy-user')
  })

  it('本地服务暂时不可用时保留已恢复的会话', async () => {
    vi.mocked(api.getMe).mockRejectedValue(new Error('Failed to fetch'))
    vi.mocked(api.isAuthenticationFailure).mockReturnValue(false)

    const auth = useAuthStore()
    await auth.init()

    expect(auth.ready).toBe(true)
    expect(auth.isLoggedIn).toBe(true)
    expect(auth.token).toBe('legacy-embedded-token')
    expect(clearAuthState).not.toHaveBeenCalled()
  })

  it('读取本机会话失败时显示安全中文提示，不将其误判为正常退出', async () => {
    vi.mocked(loadAuthState).mockRejectedValue(new Error('native storage unavailable'))

    const auth = useAuthStore()
    await auth.init()

    expect(auth.ready).toBe(true)
    expect(auth.isLoggedIn).toBe(false)
    expect(auth.restoreError).toBe('无法读取已保存的登录状态，请稍后重试。')
    expect(api.setAuthToken).toHaveBeenLastCalledWith(null, expect.any(Number))
  })

  it('恢复所选账号后自动验证身份，而不是再次请求密码', async () => {
    vi.mocked(restoreAuthAccount).mockResolvedValue({ token: 'alice-token', username: 'alice' })
    vi.mocked(api.getMe).mockResolvedValue({ id: 1, username: 'alice', createdAt: '' })

    const auth = useAuthStore()
    await expect(auth.restoreAccount('alice')).resolves.toBe(true)

    expect(restoreAuthAccount).toHaveBeenCalledWith('alice')
    expect(auth.isLoggedIn).toBe(true)
    expect(auth.username).toBe('alice')
    expect(auth.userId).toBe(1)
    expect(saveAuthState).not.toHaveBeenCalled()
  })

  it('恢复账号后的 401 不会影响其他账号，并保留所选用户名', async () => {
    vi.mocked(restoreAuthAccount).mockResolvedValue({ token: 'alice-token', username: 'alice' })
    vi.mocked(api.getMe).mockRejectedValue(new Error('Could not validate credentials'))
    vi.mocked(api.isAuthenticationFailure).mockReturnValue(true)

    const auth = useAuthStore()
    await expect(auth.restoreAccount('alice')).resolves.toBe(false)

    expect(auth.isLoggedIn).toBe(false)
    expect(auth.loginUsernameHint).toBe('alice')
    expect(clearAuthState).toHaveBeenCalledWith('alice')
  })

  it('服务端验证成功但本机持久化失败时，保留本次内存登录并给出非致命提示', async () => {
    vi.mocked(api.login).mockResolvedValue({ accessToken: 'new-token' })
    vi.mocked(api.getMe).mockResolvedValue({ id: 1, username: 'alice', createdAt: '' })
    vi.mocked(saveAuthState).mockRejectedValue(new Error('native storage unavailable'))

    const auth = useAuthStore()
    await expect(auth.login('alice', 'password')).resolves.toBe(true)

    expect(auth.isLoggedIn).toBe(true)
    expect(auth.token).toBe('new-token')
    expect(auth.username).toBe('alice')
    expect(auth.sessionWarning).toBe('本次登录未能在本机记住，关闭应用后需要重新登录。')
    expect(clearAuthState).not.toHaveBeenCalled()
  })

  it('登录令牌立即被服务拒绝时，清理该账号的会话并拒绝本次登录', async () => {
    vi.mocked(api.login).mockResolvedValue({ accessToken: 'new-token' })
    vi.mocked(api.getMe).mockRejectedValue(new Error('Could not validate credentials'))
    vi.mocked(api.isAuthenticationFailure).mockReturnValue(true)

    const auth = useAuthStore()

    await expect(auth.login('alice', 'password')).rejects.toThrow('登录状态验证失败，请重新登录。')

    expect(auth.isLoggedIn).toBe(false)
    expect(auth.token).toBe('')
    expect(auth.loginUsernameHint).toBe('alice')
    expect(clearAuthState).toHaveBeenCalledWith('alice')
  })

  it('切换账号只停用活跃会话，保留账号可供登录页恢复', async () => {
    const auth = useAuthStore()
    const taskStore = useTaskStore()
    const requirementStore = useRequirementStore()
    const teamStore = useTeamStore()
    const trashStore = useTrashStore()

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
    trashStore.tasks = [{
      id: 2,
      clientId: 'trashed-task-a',
      quadrant: 1,
      title: '账号 A 的已删除任务',
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
      deleted: true,
    }]

    await expect(auth.switchAccount()).resolves.toBe(true)

    expect(deactivateAuthState).toHaveBeenCalledTimes(1)
    expect(clearAuthState).not.toHaveBeenCalled()
    expect(auth.isLoggedIn).toBe(false)
    expect(auth.loginUsernameHint).toBe('alice')
    expect(taskStore.tasks).toEqual([])
    expect(requirementStore.requirements).toEqual([])
    expect(teamStore.team).toBeNull()
    expect(trashStore.tasks).toEqual([])
  })

  it('退出并清除登录状态时只清除当前账号，且允许移除账号名', async () => {
    const auth = useAuthStore()
    auth.token = 'service-token'
    auth.username = 'alice'
    auth.isLoggedIn = true

    await expect(auth.logout()).resolves.toBe(true)

    expect(clearAuthState).toHaveBeenCalledWith('alice')
    expect(auth.isLoggedIn).toBe(false)
    expect(auth.loginUsernameHint).toBe('alice')

    auth.token = 'service-token-b'
    auth.username = 'bob'
    auth.isLoggedIn = true
    await expect(auth.removeCurrentAccount()).resolves.toBe(true)

    expect(removeAuthAccount).toHaveBeenCalledWith('bob')
    expect(auth.isLoggedIn).toBe(false)
    expect(auth.loginUsernameHint).toBe('')
  })

  it('账号 A 的延迟 401 在切换到账号 B 后不会清除 B 的会话', async () => {
    vi.mocked(api.login)
      .mockResolvedValueOnce({ accessToken: 'token-a' })
      .mockResolvedValueOnce({ accessToken: 'token-b' })
    vi.mocked(api.getMe)
      .mockResolvedValueOnce({ id: 1, username: 'alice', createdAt: '' })
      .mockResolvedValueOnce({ id: 2, username: 'bob', createdAt: '' })

    const auth = useAuthStore()
    await auth.login('alice', 'password')
    const delayedAContext = { token: 'token-a', sessionRevision: auth.sessionRevision }

    await auth.logout()
    await auth.login('bob', 'password')

    await expect(auth.invalidateSessionIfCurrent(delayedAContext)).resolves.toBe(false)
    expect(auth.isLoggedIn).toBe(true)
    expect(auth.token).toBe('token-b')
    expect(auth.username).toBe('bob')
    expect(clearAuthState).toHaveBeenCalledWith('alice')
    expect(clearAuthState).not.toHaveBeenCalledWith('bob')
  })
})
