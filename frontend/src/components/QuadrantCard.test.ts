import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { useTaskStore, type Task } from '@/stores/taskStore'

vi.mock('./TaskItem.vue', () => ({
  default: { template: '<div class="task-item-stub" />' },
}))

import QuadrantCard from './QuadrantCard.vue'

function newDraftTask(): Task {
  return {
    id: 1,
    clientId: 'draft-task',
    quadrant: 1,
    title: '',
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

describe('QuadrantCard inline task creation', () => {
  let app: ReturnType<typeof createApp> | null = null
  let mountPoint: HTMLDivElement | null = null
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    app?.unmount()
    mountPoint?.remove()
    localStorage.clear()
    app = null
    mountPoint = null
  })

  it('retains the typed title and exposes an error when creating a task cannot be saved', async () => {
    const store = useTaskStore()
    const draft = newDraftTask()
    vi.spyOn(store, 'addTask').mockImplementation(async () => {
      store.tasks.push(draft)
      return draft
    })
    vi.spyOn(store, 'updateTask').mockResolvedValue(false)
    store.serviceError = '服务写入失败，请重试。'

    mountPoint = document.createElement('div')
    document.body.appendChild(mountPoint)
    app = createApp(QuadrantCard, { quadrant: 1 })
    app.use(pinia)
    app.mount(mountPoint)

    mountPoint.querySelector<HTMLButtonElement>('.quadrant-add')?.click()
    await vi.waitFor(() => {
      expect(mountPoint?.querySelector<HTMLInputElement>('.inline-add-input')).not.toBeNull()
    })

    const input = mountPoint.querySelector<HTMLInputElement>('.inline-add-input')!
    input.value = '不能丢失的草稿标题'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    await vi.waitFor(() => {
      expect(store.updateTask).toHaveBeenCalledWith('draft-task', { title: '不能丢失的草稿标题' })
      expect(mountPoint?.querySelector('[role="alert"]')?.textContent).toContain('服务写入失败')
    })
    expect(input.value).toBe('不能丢失的草稿标题')
    expect(store.tasks[0]?.title).toBe('不能丢失的草稿标题')
  })
})
