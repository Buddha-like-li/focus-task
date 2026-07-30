import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Task } from './taskStore'

const apiMocks = vi.hoisted(() => {
  class ApiRequestError extends Error {
    status: number

    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  }

  return {
    ApiRequestError,
    listTasks: vi.fn(),
    listTrashTasks: vi.fn(),
    moveTaskToTrash: vi.fn(),
  }
})

vi.mock('@/api', () => apiMocks)

import * as api from '@/api'
import { useTaskStore } from './taskStore'
import { useTrashStore } from './trashStore'

function makeServerTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    clientId: 'server-task',
    quadrant: 1,
    title: '服务端任务',
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
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('taskStore task belonging normalization', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(api.listTrashTasks).mockResolvedValue([])
  })

  it('uses the default belonging for a whitespace-only value returned by the service', async () => {
    vi.mocked(api.listTasks).mockResolvedValue([
      makeServerTask({ taskBelonging: '   ' }),
    ])

    const taskStore = useTaskStore()
    await taskStore.fetchTasks()

    expect(taskStore.tasks[0]?.taskBelonging).toBe('项目管理')
  })

  it('trims a non-empty belonging returned by the service', async () => {
    vi.mocked(api.listTasks).mockResolvedValue([
      makeServerTask({ taskBelonging: '  客户专项  ' }),
    ])

    const taskStore = useTaskStore()
    await taskStore.fetchTasks()

    expect(taskStore.tasks[0]?.taskBelonging).toBe('客户专项')
  })

  it('writes or refreshes a task returned by a service workflow', () => {
    const taskStore = useTaskStore()
    const created = taskStore.upsertServerTask(makeServerTask({
      clientId: 'promoted-task',
      title: '已转换任务',
      quadrant: 3,
      taskBelonging: '  客户专项  ',
    }))

    taskStore.upsertServerTask({ ...created, title: '已转换任务（更新）' })

    expect(taskStore.tasks).toHaveLength(1)
    expect(taskStore.tasks[0]).toMatchObject({
      clientId: 'promoted-task',
      title: '已转换任务（更新）',
      quadrant: 3,
      taskBelonging: '客户专项',
    })
  })

  it('移入垃圾桶成功后立即更新垃圾桶数量', async () => {
    vi.mocked(api.moveTaskToTrash).mockResolvedValue(undefined)
    const taskStore = useTaskStore()
    const trashStore = useTrashStore()
    taskStore.replaceServerTasks([makeServerTask({ id: 12, clientId: 'move-to-trash' })])

    await expect(taskStore.moveTaskToTrash('move-to-trash')).resolves.toBe(true)

    expect(taskStore.tasks).toEqual([])
    expect(trashStore.count).toBe(1)
    expect(trashStore.tasks[0]).toMatchObject({ id: 12, clientId: 'move-to-trash', deleted: true })
  })

  it('旧服务不支持垃圾桶时不发出删除请求，并说明需要更新服务镜像', async () => {
    vi.mocked(api.listTrashTasks).mockRejectedValue(new apiMocks.ApiRequestError('not found', 404))
    const taskStore = useTaskStore()
    taskStore.replaceServerTasks([makeServerTask({ id: 15, clientId: 'legacy-service-task' })])

    await expect(taskStore.moveTaskToTrash('legacy-service-task')).resolves.toBe(false)

    expect(api.moveTaskToTrash).not.toHaveBeenCalled()
    expect(taskStore.tasks).toHaveLength(1)
    expect(taskStore.serviceError).toBe('本机服务版本不支持垃圾桶，请先更新服务镜像。')
  })

  it('垃圾桶能力检查的登录错误保持服务原始提示', async () => {
    vi.mocked(api.listTrashTasks).mockRejectedValue(new apiMocks.ApiRequestError('登录状态已过期，请重新登录。', 401))
    const taskStore = useTaskStore()
    taskStore.replaceServerTasks([makeServerTask({ id: 16, clientId: 'expired-session-task' })])

    await expect(taskStore.moveTaskToTrash('expired-session-task')).resolves.toBe(false)

    expect(api.moveTaskToTrash).not.toHaveBeenCalled()
    expect(taskStore.serviceError).toBe('登录状态已过期，请重新登录。')
  })

  it('移入父任务垃圾桶时同时从扁平工作台缓存移除子任务', async () => {
    vi.mocked(api.moveTaskToTrash).mockResolvedValue(undefined)
    const taskStore = useTaskStore()
    taskStore.replaceServerTasks([
      makeServerTask({ id: 20, clientId: 'parent-task', title: '父任务' }),
      makeServerTask({ id: 21, clientId: 'child-task', title: '子任务', parentTaskId: 'parent-task' }),
    ])
    taskStore.selectTask('child-task')

    await expect(taskStore.moveTaskToTrash('parent-task')).resolves.toBe(true)

    expect(taskStore.tasks).toEqual([])
    expect(taskStore.selectedTaskId).toBeNull()
  })

  it('移入垃圾桶后不会让同一账号更早的列表响应复活该任务', async () => {
    const staleList = deferred<Task[]>()
    vi.mocked(api.listTasks).mockReturnValueOnce(staleList.promise)
    vi.mocked(api.moveTaskToTrash).mockResolvedValue(undefined)
    const taskStore = useTaskStore()
    taskStore.replaceServerTasks([makeServerTask({ id: 23, clientId: 'stale-task' })])

    const loading = taskStore.fetchTasks()
    await expect(taskStore.moveTaskToTrash('stale-task')).resolves.toBe(true)
    staleList.resolve([makeServerTask({ id: 23, clientId: 'stale-task' })])
    await loading

    expect(taskStore.tasks).toEqual([])
    expect(taskStore.loading).toBe(false)
  })
})
