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
})
