import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Requirement, Team } from '@/api'
import type { Task } from './taskStore'

const apiMocks = vi.hoisted(() => ({
  listTasks: vi.fn(),
  listRequirements: vi.fn(),
  getTeam: vi.fn(),
  createRequirement: vi.fn(),
  updateRequirement: vi.fn(),
  deleteRequirement: vi.fn(),
  createTeam: vi.fn(),
  updateTeam: vi.fn(),
  dissolveTeam: vi.fn(),
  inviteTeamMember: vi.fn(),
  updateTeamMemberRole: vi.fn(),
  removeTeamMember: vi.fn(),
  listMemberTasks: vi.fn(),
}))

vi.mock('@/api', () => apiMocks)

vi.mock('@/composables/useAppLogger', () => ({
  appLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    buffer: vi.fn(),
  },
}))

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: () => ({
    state: { defaultStartTime: '09:00', defaultDueTime: '18:00' },
  }),
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ userId: null, role: '' }),
}))

import { useTaskStore } from './taskStore'
import { useRequirementStore } from './requirementStore'
import { useTeamStore } from './teamStore'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function task(clientId: string, title: string): Task {
  return {
    id: 1,
    clientId,
    quadrant: 1,
    title,
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
  }
}

function requirement(id: number, title: string): Requirement {
  return {
    id,
    title,
    content: '',
    status: '待处理',
    priority: '中',
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  }
}

function team(id: number, name: string): Team {
  return { id, name, creatorId: id, createdAt: '', members: [] }
}

describe('账号切换期间的请求隔离', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('账号 A 的旧任务响应不会覆盖账号 B 的任务', async () => {
    const requestA = deferred<Task[]>()
    apiMocks.listTasks
      .mockImplementationOnce(() => requestA.promise)
      .mockResolvedValueOnce([task('task-b', '账号 B 的任务')])
    const store = useTaskStore()

    const fetchA = store.fetchTasks()
    store.clearSessionState()
    await store.fetchTasks()
    requestA.resolve([task('task-a', '账号 A 的任务')])
    await fetchA

    expect(store.tasks.map(item => item.title)).toEqual(['账号 B 的任务'])
    expect(store.loading).toBe(false)
  })

  it('账号 A 的旧需求响应不会覆盖账号 B 的需求池', async () => {
    const requestA = deferred<Requirement[]>()
    apiMocks.listRequirements
      .mockImplementationOnce(() => requestA.promise)
      .mockResolvedValueOnce([requirement(2, '账号 B 的需求')])
    const store = useRequirementStore()

    const fetchA = store.fetchAll()
    store.clearSessionState()
    await store.fetchAll()
    requestA.resolve([requirement(1, '账号 A 的需求')])
    await fetchA

    expect(store.requirements.map(item => item.title)).toEqual(['账号 B 的需求'])
    expect(store.loading).toBe(false)
  })

  it('账号 A 的旧团队响应不会覆盖账号 B 的团队', async () => {
    const requestA = deferred<Team | null>()
    apiMocks.getTeam
      .mockImplementationOnce(() => requestA.promise)
      .mockResolvedValueOnce(team(2, '账号 B 的团队'))
    const store = useTeamStore()

    const fetchA = store.fetchTeam()
    store.clearSessionState()
    await store.fetchTeam()
    requestA.resolve(team(1, '账号 A 的团队'))
    await fetchA

    expect(store.team?.name).toBe('账号 B 的团队')
    expect(store.loading).toBe(false)
  })
})
