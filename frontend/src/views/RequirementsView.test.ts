import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import type { Requirement } from '@/api'
import type { Task } from '@/stores/taskStore'
import { useRequirementStore } from '@/stores/requirementStore'
import { useTaskStore } from '@/stores/taskStore'

vi.mock('@/api', () => ({
  listRequirements: vi.fn(),
  createRequirement: vi.fn(),
  updateRequirement: vi.fn(),
  deleteRequirement: vi.fn(),
  promoteRequirement: vi.fn(),
  listRequirementAttachments: vi.fn().mockResolvedValue([]),
  uploadRequirementAttachment: vi.fn(),
  downloadRequirementAttachment: vi.fn(),
  deleteRequirementAttachment: vi.fn(),
  listRequirementTasks: vi.fn().mockResolvedValue([]),
}))

vi.mock('naive-ui', () => ({
  NModal: {
    props: { show: Boolean },
    template: '<div v-if="show" class="modal-stub"><slot /></div>',
  },
  NCard: {
    props: { title: String },
    template: '<section class="card-stub"><h2>{{ title }}</h2><slot /><footer><slot name="footer" /></footer></section>',
  },
}))

import * as api from '@/api'
import RequirementsView from './RequirementsView.vue'

function makeRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: 1,
    title: '待转换需求',
    content: '需求内容',
    status: '计划中',
    priority: '中',
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function makePromotedTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 10,
    clientId: 'promoted-task',
    quadrant: 1,
    title: '已转换任务',
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
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('RequirementsView', () => {
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

  async function mountView(requirements: Requirement[]) {
    const requirementStore = useRequirementStore()
    const taskStore = useTaskStore()
    requirementStore.requirements = requirements
    taskStore.setView('requirements')

    mountPoint = document.createElement('div')
    document.body.appendChild(mountPoint)
    app = createApp(RequirementsView)
    app.use(pinia)
    app.mount(mountPoint)

    await vi.waitFor(() => {
      expect(mountPoint?.querySelector<HTMLButtonElement>('.req-promote')).not.toBeNull()
    })

    return { requirementStore, taskStore }
  }

  it('keeps the linked-task entry inline and does not open the editor when expanded', async () => {
    const requirement = makeRequirement({ linkedTaskCount: 1 })
    await mountView([requirement])
    vi.mocked(api.listRequirementTasks).mockResolvedValueOnce([])

    const meta = mountPoint!.querySelector('.req-card-meta')
    const toggle = meta?.querySelector<HTMLButtonElement>('.req-linked-toggle')
    expect(meta?.querySelector('.req-card-time')).not.toBeNull()
    expect(toggle).not.toBeNull()

    toggle!.click()

    await vi.waitFor(() => {
      expect(api.listRequirementTasks).toHaveBeenCalledWith(requirement.id)
      expect(mountPoint?.querySelector('.req-linked-body')).not.toBeNull()
    })
    expect(mountPoint?.querySelector('.modal-stub')).toBeNull()
  })

  it('converts a requirement through the service, writes its task, and opens it in the matrix', async () => {
    const requirement = makeRequirement()
    const { requirementStore, taskStore } = await mountView([requirement])
    const promotedTask = makePromotedTask({ quadrant: 2 })
    const promotion = deferred<Task>()
    vi.mocked(api.promoteRequirement).mockReturnValueOnce(promotion.promise)

    mountPoint!.querySelector<HTMLButtonElement>('.req-promote')!.click()
    await vi.waitFor(() => {
      expect(mountPoint?.querySelector<HTMLInputElement>('input[name="promote-quadrant"][value="2"]')).not.toBeNull()
    })

    const quadrant = mountPoint!.querySelector<HTMLInputElement>('input[name="promote-quadrant"][value="2"]')!
    quadrant.checked = true
    quadrant.dispatchEvent(new Event('change', { bubbles: true }))

    const confirm = mountPoint!.querySelector<HTMLButtonElement>('.req-promote-confirm')!
    confirm.click()
    confirm.click()

    await vi.waitFor(() => {
      expect(api.promoteRequirement).toHaveBeenCalledTimes(1)
      expect(api.promoteRequirement).toHaveBeenCalledWith(requirement.id, 2)
      expect(confirm.disabled).toBe(true)
      expect(mountPoint?.querySelector<HTMLButtonElement>('.req-promote')?.disabled).toBe(true)
      expect(mountPoint?.querySelector<HTMLButtonElement>('.req-delete')?.disabled).toBe(true)
    })

    promotion.resolve(promotedTask)

    await vi.waitFor(() => {
      expect(requirementStore.requirements).toEqual([])
      expect(taskStore.tasks).toEqual([expect.objectContaining({ clientId: 'promoted-task', quadrant: 2 })])
      expect(taskStore.currentView).toBe('matrix')
      expect(taskStore.selectedTaskId).toBe('promoted-task')
      expect(mountPoint?.querySelector('.modal-stub')).toBeNull()
    })
  })

  it('keeps the requirement and gives a Chinese retryable error when conversion fails', async () => {
    const requirement = makeRequirement()
    const { requirementStore, taskStore } = await mountView([requirement])
    vi.mocked(api.promoteRequirement).mockRejectedValueOnce(new Error('服务不可用'))

    mountPoint!.querySelector<HTMLButtonElement>('.req-promote')!.click()
    await vi.waitFor(() => {
      expect(mountPoint?.querySelector<HTMLButtonElement>('.req-promote-confirm')).not.toBeNull()
    })
    mountPoint!.querySelector<HTMLButtonElement>('.req-promote-confirm')!.click()

    await vi.waitFor(() => {
      expect(mountPoint?.querySelector('[role="alert"]')?.textContent).toContain('转换失败，需求仍保留在需求池')
    })
    expect(requirementStore.requirements).toEqual([requirement])
    expect(taskStore.tasks).toEqual([])
    expect(taskStore.currentView).toBe('requirements')
  })

  it('does not write an old account conversion into the next account workspace', async () => {
    const requirement = makeRequirement({ id: 1, title: '账号 A 的需求' })
    const { requirementStore, taskStore } = await mountView([requirement])
    const conversion = deferred<Task>()
    vi.mocked(api.promoteRequirement).mockReturnValueOnce(conversion.promise)

    mountPoint!.querySelector<HTMLButtonElement>('.req-promote')!.click()
    await vi.waitFor(() => {
      expect(mountPoint?.querySelector<HTMLButtonElement>('.req-promote-confirm')).not.toBeNull()
    })
    mountPoint!.querySelector<HTMLButtonElement>('.req-promote-confirm')!.click()

    requirementStore.clearSessionState()
    requirementStore.requirements = [makeRequirement({ id: 2, title: '账号 B 的需求' })]
    taskStore.clearSessionState()
    taskStore.replaceServerTasks([makePromotedTask({ clientId: 'account-b-task', title: '账号 B 的任务' })])
    conversion.resolve(makePromotedTask({ clientId: 'account-a-task', title: '账号 A 的任务' }))

    await vi.waitFor(() => {
      expect(requirementStore.requirements).toEqual([expect.objectContaining({ id: 2, title: '账号 B 的需求' })])
      expect(taskStore.tasks).toEqual([expect.objectContaining({ clientId: 'account-b-task', title: '账号 B 的任务' })])
    })
    expect(taskStore.currentView).toBe('matrix')
    expect(taskStore.selectedTaskId).toBeNull()
  })
})
