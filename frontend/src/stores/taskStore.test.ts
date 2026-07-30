import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Task } from './taskStore'

vi.mock('@/api', () => ({
  listTasks: vi.fn(),
  moveTaskToTrash: vi.fn(),
}))

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

describe('taskStore task belonging normalization', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
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
})
