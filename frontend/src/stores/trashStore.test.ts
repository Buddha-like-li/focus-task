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
    listTrashTasks: vi.fn(),
    restoreTrashTask: vi.fn(),
    permanentlyDeleteTask: vi.fn(),
  }
})

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

import { useTrashStore } from './trashStore'

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 7,
    clientId: 'trashed-task',
    quadrant: 1,
    title: '已删除任务',
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

describe('垃圾桶任务状态', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('独立加载服务端垃圾桶，并防御性排除意外返回的活动任务', async () => {
    apiMocks.listTrashTasks.mockResolvedValue([
      task(),
      task({ id: 8, clientId: 'active-task', deleted: false }),
    ])

    const store = useTrashStore()
    await store.fetchTrash()

    expect(apiMocks.listTrashTasks).toHaveBeenCalledTimes(1)
    expect(store.tasks.map((item) => item.id)).toEqual([7])
    expect(store.count).toBe(1)
  })

  it('首次移入垃圾桶前验证服务能力，成功结果仅缓存到当前会话', async () => {
    apiMocks.listTrashTasks.mockResolvedValue([])
    const store = useTrashStore()

    await store.ensureTrashSupported()
    await store.ensureTrashSupported()
    expect(apiMocks.listTrashTasks).toHaveBeenCalledTimes(1)

    store.clearSessionState()
    await store.ensureTrashSupported()
    expect(apiMocks.listTrashTasks).toHaveBeenCalledTimes(2)
  })

  it('旧服务返回 422 时明确说明垃圾桶不可用', async () => {
    apiMocks.listTrashTasks.mockRejectedValue(new apiMocks.ApiRequestError('invalid task id', 422))
    const store = useTrashStore()

    await expect(store.ensureTrashSupported()).rejects.toThrow('本机服务版本不支持垃圾桶，请先更新服务镜像。')
  })

  it('恢复成功后立即从垃圾桶移除，失败时保留任务并显示中文冲突提示', async () => {
    const store = useTrashStore()
    store.tasks = [task()]
    apiMocks.restoreTrashTask.mockResolvedValue(task({ deleted: false }))

    await expect(store.restoreTask(store.tasks[0]!)).resolves.toMatchObject({ id: 7, deleted: false })
    expect(store.tasks).toEqual([])

    store.tasks = [task()]
    apiMocks.restoreTrashTask.mockRejectedValue(new apiMocks.ApiRequestError('conflict', 409))
    await expect(store.restoreTask(store.tasks[0]!)).resolves.toBeNull()
    expect(store.tasks).toHaveLength(1)
    expect(store.error).toContain('当前无法恢复')
    expect(store.error).not.toContain('conflict')
  })

  it('永久删除成功后即时移除，失败时不从列表中删除', async () => {
    const store = useTrashStore()
    store.tasks = [task()]
    apiMocks.permanentlyDeleteTask.mockResolvedValue({
      ok: true,
      permanentlyDeleted: true,
      cleanupPending: false,
    })

    await expect(store.permanentlyDeleteTask(store.tasks[0]!)).resolves.toEqual({ cleanupPending: false })
    expect(store.tasks).toEqual([])

    store.tasks = [task()]
    apiMocks.permanentlyDeleteTask.mockRejectedValue(new Error('offline'))
    await expect(store.permanentlyDeleteTask(store.tasks[0]!)).resolves.toBeNull()
    expect(store.tasks).toHaveLength(1)
    expect(store.error).toBe('彻底删除任务失败，请确认本地服务正常后重试。')
  })

  it('账号切换后，旧账号的延迟垃圾桶响应不能覆盖新账号数据', async () => {
    const delayed = deferred<Task[]>()
    apiMocks.listTrashTasks
      .mockImplementationOnce(() => delayed.promise)
      .mockResolvedValueOnce([task({ id: 9, clientId: 'account-b-task', title: '账号 B 的任务' })])
    const store = useTrashStore()

    const loadingA = store.fetchTrash()
    store.clearSessionState()
    await store.fetchTrash()
    delayed.resolve([task({ id: 8, clientId: 'account-a-task', title: '账号 A 的任务' })])
    await loadingA

    expect(store.tasks.map((item) => item.title)).toEqual(['账号 B 的任务'])
    expect(store.loading).toBe(false)
  })

  it('移入垃圾桶后保留乐观条目，不让更早的列表响应覆盖导航数量', async () => {
    const delayed = deferred<Task[]>()
    apiMocks.listTrashTasks.mockReturnValueOnce(delayed.promise)
    const store = useTrashStore()

    const loading = store.fetchTrash()
    store.recordMovedTask(task({ id: 11, clientId: 'newly-trashed-task' }))
    delayed.resolve([])
    await loading

    expect(store.count).toBe(1)
    expect(store.tasks[0]).toMatchObject({ id: 11, deleted: true })
  })

  it('将服务端文件清理待处理状态交给页面显示', async () => {
    const store = useTrashStore()
    store.tasks = [task()]
    apiMocks.permanentlyDeleteTask.mockResolvedValue({
      ok: true,
      permanentlyDeleted: true,
      cleanupPending: true,
    })

    await expect(store.permanentlyDeleteTask(store.tasks[0]!)).resolves.toEqual({ cleanupPending: true })
    expect(store.tasks).toEqual([])
  })

  it('服务没有确认彻底删除时保留垃圾桶任务', async () => {
    const store = useTrashStore()
    store.tasks = [task()]
    apiMocks.permanentlyDeleteTask.mockResolvedValue({
      ok: false,
      permanentlyDeleted: false,
      cleanupPending: false,
    })

    await expect(store.permanentlyDeleteTask(store.tasks[0]!)).resolves.toBeNull()
    expect(store.tasks).toHaveLength(1)
    expect(store.error).toBe('服务未确认任务已彻底删除，请刷新垃圾桶后重试。')
  })
})
