import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Task } from './taskStore'

vi.mock('@/api', () => ({
  listTasks: vi.fn(),
}))

import * as api from '@/api'
import { useTaskStore } from './taskStore'

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
})
