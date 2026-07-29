import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Requirement, Team } from '@/api'
import type { Task } from './taskStore'

const apiMocks = vi.hoisted(() => ({
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  reorderTasks: vi.fn(),
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

function member(userId: number, username: string, role = '开发') {
  return { userId, username, role, joinedAt: '' }
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

  it('账号 A 的任务写操作不会写入账号 B 的任务状态', async () => {
    const store = useTaskStore()

    const addA = deferred<Task>()
    apiMocks.createTask.mockReturnValueOnce(addA.promise)
    const adding = store.addTask(1, '账号 A 新建任务')
    store.clearSessionState()
    store.replaceServerTasks([task('shared', '账号 B 原有任务')])
    addA.resolve(task('task-a', '账号 A 新建任务'))
    await adding
    expect(store.tasks.map(item => item.title)).toEqual(['账号 B 原有任务'])

    const updateA = deferred<Task>()
    apiMocks.updateTask.mockReturnValueOnce(updateA.promise)
    store.replaceServerTasks([task('shared', '账号 A 旧标题')])
    const updating = store.updateTask('shared', { title: '账号 A 新标题' })
    store.clearSessionState()
    store.replaceServerTasks([task('shared', '账号 B 标题')])
    updateA.resolve(task('shared', '账号 A 新标题'))
    await expect(updating).resolves.toBe(false)
    expect(store.tasks[0]?.title).toBe('账号 B 标题')

    const deleteA = deferred<void>()
    apiMocks.deleteTask.mockReturnValueOnce(deleteA.promise)
    store.replaceServerTasks([task('shared', '账号 A 待删任务')])
    const deleting = store.removeTask('shared')
    store.clearSessionState()
    store.replaceServerTasks([task('shared', '账号 B 保留任务')])
    deleteA.resolve()
    await expect(deleting).resolves.toBe(false)
    expect(store.tasks[0]?.title).toBe('账号 B 保留任务')

    const reorderA = deferred<void>()
    apiMocks.reorderTasks.mockReturnValueOnce(reorderA.promise)
    const reordering = store.reorderTasks([{ clientId: 'shared', sortOrder: 0 }])
    store.clearSessionState()
    reorderA.resolve()
    await expect(reordering).resolves.toBe(false)
  })

  it('账号 A 的需求写操作不会写入账号 B 的需求池', async () => {
    const store = useRequirementStore()

    const addA = deferred<Requirement>()
    apiMocks.createRequirement.mockReturnValueOnce(addA.promise)
    const adding = store.add({ title: '账号 A 新需求' })
    store.clearSessionState()
    store.requirements = [requirement(2, '账号 B 原有需求')]
    addA.resolve(requirement(1, '账号 A 新需求'))
    await adding
    expect(store.requirements.map(item => item.title)).toEqual(['账号 B 原有需求'])

    const updateA = deferred<Requirement>()
    apiMocks.updateRequirement.mockReturnValueOnce(updateA.promise)
    store.requirements = [requirement(1, '账号 A 旧需求')]
    const updating = store.update(1, { title: '账号 A 新需求' })
    store.clearSessionState()
    store.requirements = [requirement(1, '账号 B 需求')]
    updateA.resolve(requirement(1, '账号 A 新需求'))
    await updating
    expect(store.requirements[0]?.title).toBe('账号 B 需求')

    const deleteA = deferred<void>()
    apiMocks.deleteRequirement.mockReturnValueOnce(deleteA.promise)
    store.requirements = [requirement(1, '账号 A 待删需求')]
    const deleting = store.remove(1)
    store.clearSessionState()
    store.requirements = [requirement(1, '账号 B 保留需求')]
    deleteA.resolve()
    await deleting
    expect(store.requirements[0]?.title).toBe('账号 B 保留需求')
  })

  it('账号 A 的团队写操作不会写入账号 B 的团队状态', async () => {
    const store = useTeamStore()

    const createA = deferred<Team>()
    apiMocks.createTeam.mockReturnValueOnce(createA.promise)
    const creating = store.createTeam('账号 A 团队')
    store.clearSessionState()
    store.team = team(2, '账号 B 团队')
    createA.resolve(team(1, '账号 A 团队'))
    await creating
    expect(store.team?.name).toBe('账号 B 团队')

    const updateA = deferred<Team>()
    apiMocks.updateTeam.mockReturnValueOnce(updateA.promise)
    store.team = team(1, '账号 A 旧团队')
    const updating = store.updateTeamName('账号 A 新团队')
    store.clearSessionState()
    store.team = team(2, '账号 B 团队')
    updateA.resolve(team(1, '账号 A 新团队'))
    await updating
    expect(store.team?.name).toBe('账号 B 团队')

    const dissolveA = deferred<void>()
    apiMocks.dissolveTeam.mockReturnValueOnce(dissolveA.promise)
    store.team = team(1, '账号 A 待解散团队')
    const dissolving = store.dissolveTeam()
    store.clearSessionState()
    store.team = team(2, '账号 B 团队')
    dissolveA.resolve()
    await dissolving
    expect(store.team?.name).toBe('账号 B 团队')

    const inviteA = deferred<ReturnType<typeof member>>()
    apiMocks.inviteTeamMember.mockReturnValueOnce(inviteA.promise)
    store.members = [member(1, '账号A')]
    const inviting = store.inviteMember('账号A新成员', '开发')
    store.clearSessionState()
    store.members = [member(2, '账号B')]
    inviteA.resolve(member(3, '账号A新成员'))
    await inviting
    expect(store.members.map(item => item.username)).toEqual(['账号B'])

    const roleA = deferred<void>()
    apiMocks.updateTeamMemberRole.mockReturnValueOnce(roleA.promise)
    store.members = [member(1, '账号A', '开发')]
    const changingRole = store.updateMemberRole(1, '管理')
    store.clearSessionState()
    store.members = [member(1, '账号B', '开发')]
    roleA.resolve()
    await changingRole
    expect(store.members[0]?.role).toBe('开发')

    const removeA = deferred<void>()
    apiMocks.removeTeamMember.mockReturnValueOnce(removeA.promise)
    store.members = [member(1, '账号A')]
    const removing = store.removeMember(1)
    store.clearSessionState()
    store.members = [member(1, '账号B')]
    removeA.resolve()
    await removing
    expect(store.members.map(item => item.username)).toEqual(['账号B'])
  })
})
