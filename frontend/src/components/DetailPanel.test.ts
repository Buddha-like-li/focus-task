import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { useRequirementStore } from '@/stores/requirementStore'
import { useTaskStore, type Task } from '@/stores/taskStore'

vi.mock('@/api', () => ({
  listTaskAttachments: vi.fn().mockResolvedValue([]),
  listTaskComments: vi.fn().mockResolvedValue([]),
  listTaskPrdAttachments: vi.fn().mockResolvedValue([]),
}))

vi.mock('./ContentModal.vue', () => ({
  default: { template: '<section />' },
}))

import DetailPanel from './DetailPanel.vue'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    clientId: 'selected-task',
    quadrant: 1,
    title: '测试任务',
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
    taskBelonging: '项目管理',
    ...overrides,
  }
}

describe('DetailPanel task belonging', () => {
  let app: ReturnType<typeof createApp> | null = null
  let mountPoint: HTMLDivElement | null = null
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
  })

  afterEach(() => {
    app?.unmount()
    mountPoint?.remove()
    app = null
    mountPoint = null
  })

  it('allows a custom belonging, preserves existing suggestions, and saves through the task store', async () => {
    const taskStore = useTaskStore()
    const selected = makeTask()
    taskStore.tasks = [
      selected,
      makeTask({ id: 2, clientId: 'custom-task', taskBelonging: '客户专项' }),
    ]
    taskStore.selectedTaskId = selected.clientId
    vi.spyOn(taskStore, 'updateTask').mockResolvedValue(true)

    // Avoid an unrelated requirements request while mounting the detail panel.
    useRequirementStore().requirements = [{
      id: 1,
      title: '已有需求',
      content: '',
      priority: '中',
      status: '待处理',
      sortOrder: 0,
      createdAt: '',
      updatedAt: '',
    }]

    mountPoint = document.createElement('div')
    document.body.appendChild(mountPoint)
    app = createApp(DetailPanel)
    app.use(pinia)
    app.mount(mountPoint)

    await vi.waitFor(() => {
      expect(mountPoint?.querySelector<HTMLInputElement>('[data-testid="task-belonging-input"]')).not.toBeNull()
    })

    const input = mountPoint!.querySelector<HTMLInputElement>('[data-testid="task-belonging-input"]')!
    const suggestions = Array.from(mountPoint!.querySelectorAll<HTMLOptionElement>('#task-belonging-options option'))
      .map(option => option.value)

    expect(input.getAttribute('list')).toBe('task-belonging-options')
    expect(input.maxLength).toBe(100)
    expect(suggestions).toContain('项目管理')
    expect(suggestions).toContain('客户专项')

    input.value = '新建归属'
    input.dispatchEvent(new Event('change', { bubbles: true }))

    await vi.waitFor(() => {
      expect(taskStore.updateTask).toHaveBeenCalledWith('selected-task', { taskBelonging: '新建归属' })
    })
  })
})
