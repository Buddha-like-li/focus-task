import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import type { Task } from '@/stores/taskStore'

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
    listTasks: vi.fn(),
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

vi.mock('@/utils/reportFileActions', () => ({
  deleteTaskReportCopies: vi.fn(),
}))

vi.mock('naive-ui', () => ({
  NModal: {
    props: { show: Boolean },
    template: '<div v-if="show"><slot /></div>',
  },
  NCard: {
    props: { title: String },
    template: '<section><h3>{{ title }}</h3><slot /><footer><slot name="footer" /></footer></section>',
  },
  NButton: {
    props: { disabled: Boolean, loading: Boolean },
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
}))

import { deleteTaskReportCopies } from '@/utils/reportFileActions'
import TrashView from './TrashView.vue'

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 42,
    clientId: 'trashed-task',
    quadrant: 1,
    title: '待处理的删除任务',
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

function buttonByText(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .find((button) => button.textContent?.trim() === text)
}

describe('垃圾桶页面', () => {
  let app: ReturnType<typeof createApp> | null = null
  let mountPoint: HTMLDivElement | null = null
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    apiMocks.listTrashTasks.mockResolvedValue([task()])
    apiMocks.listTasks.mockResolvedValue([])
    vi.mocked(deleteTaskReportCopies).mockResolvedValue(1)
  })

  afterEach(() => {
    app?.unmount()
    mountPoint?.remove()
    app = null
    mountPoint = null
  })

  async function mountView() {
    mountPoint = document.createElement('div')
    document.body.appendChild(mountPoint)
    app = createApp(TrashView)
    app.use(pinia)
    app.mount(mountPoint)
    await vi.waitFor(() => {
      expect(mountPoint?.textContent).toContain('待处理的删除任务')
    })
  }

  it('独立显示垃圾桶任务，且没有详情、文件下载或打开文件夹入口', async () => {
    await mountView()

    expect(apiMocks.listTrashTasks).toHaveBeenCalled()
    expect(mountPoint?.textContent).toContain('恢复')
    expect(mountPoint?.textContent).toContain('彻底删除')
    expect(mountPoint?.textContent).not.toContain('打开所在文件夹')
    expect(mountPoint?.textContent).not.toContain('下载文件')
  })

  it('恢复后刷新工作台任务，并从垃圾桶列表移除该任务', async () => {
    apiMocks.restoreTrashTask.mockResolvedValue(task({ deleted: false }))
    apiMocks.listTasks.mockResolvedValue([task({ deleted: false })])
    await mountView()

    buttonByText(mountPoint!, '恢复')?.click()

    await vi.waitFor(() => {
      expect(apiMocks.restoreTrashTask).toHaveBeenCalledWith(42)
      expect(apiMocks.listTasks).toHaveBeenCalled()
      expect(mountPoint?.textContent).toContain('垃圾桶为空')
    })
  })

  it('永久删除须经受控中文确认，并在服务成功后清理本机任务报告副本', async () => {
    apiMocks.permanentlyDeleteTask.mockResolvedValue({
      ok: true,
      permanentlyDeleted: true,
      cleanupPending: false,
    })
    await mountView()

    buttonByText(mountPoint!, '彻底删除')?.click()
    await vi.waitFor(() => {
      expect(mountPoint?.textContent).toContain('此操作无法恢复')
      expect(mountPoint?.textContent).toContain('子任务也会一并永久删除')
    })

    const confirmations = Array.from(mountPoint!.querySelectorAll<HTMLButtonElement>('button'))
      .filter((button) => button.textContent?.trim() === '彻底删除')
    const confirmation = confirmations[confirmations.length - 1]
    confirmation?.click()

    await vi.waitFor(() => {
      expect(apiMocks.permanentlyDeleteTask).toHaveBeenCalledWith(42)
      expect(deleteTaskReportCopies).toHaveBeenCalledWith(42)
      expect(mountPoint?.textContent).toContain('垃圾桶为空')
    })
  })

  it('永久删除父任务时清理所有子任务的本机任务报告副本', async () => {
    apiMocks.permanentlyDeleteTask.mockResolvedValue({
      ok: true,
      permanentlyDeleted: true,
      cleanupPending: false,
    })
    apiMocks.listTrashTasks.mockResolvedValue([task({
      subtasks: [
        task({ id: 43, clientId: 'child-task', title: '子任务', subtasks: [
          task({ id: 44, clientId: 'grandchild-task', title: '孙任务' }),
        ] }),
      ],
    })])
    await mountView()

    buttonByText(mountPoint!, '彻底删除')?.click()
    await vi.waitFor(() => expect(mountPoint?.textContent).toContain('此操作无法恢复'))
    const confirmations = Array.from(mountPoint!.querySelectorAll<HTMLButtonElement>('button'))
      .filter((button) => button.textContent?.trim() === '彻底删除')
    confirmations[confirmations.length - 1]?.click()

    await vi.waitFor(() => {
      expect(deleteTaskReportCopies).toHaveBeenCalledTimes(3)
      expect(deleteTaskReportCopies).toHaveBeenCalledWith(42)
      expect(deleteTaskReportCopies).toHaveBeenCalledWith(43)
      expect(deleteTaskReportCopies).toHaveBeenCalledWith(44)
    })
  })

  it('任何本机副本清理失败都会明确提示，但不撤销已完成的服务端删除', async () => {
    apiMocks.permanentlyDeleteTask.mockResolvedValue({
      ok: true,
      permanentlyDeleted: true,
      cleanupPending: false,
    })
    vi.mocked(deleteTaskReportCopies).mockRejectedValueOnce(new Error('locked'))
    await mountView()

    buttonByText(mountPoint!, '彻底删除')?.click()
    await vi.waitFor(() => expect(mountPoint?.textContent).toContain('此操作无法恢复'))
    const confirmations = Array.from(mountPoint!.querySelectorAll<HTMLButtonElement>('button'))
      .filter((button) => button.textContent?.trim() === '彻底删除')
    confirmations[confirmations.length - 1]?.click()

    await vi.waitFor(() => {
      expect(mountPoint?.textContent).toContain('服务数据已删除，但本机报告副本清理失败，涉及 1 项任务。')
      expect(mountPoint?.textContent).toContain('垃圾桶为空')
    })
  })

  it('服务记录删除但服务端文件清理待处理时显示明确警告', async () => {
    apiMocks.permanentlyDeleteTask.mockResolvedValue({
      ok: true,
      permanentlyDeleted: true,
      cleanupPending: true,
    })
    await mountView()

    buttonByText(mountPoint!, '彻底删除')?.click()
    await vi.waitFor(() => expect(mountPoint?.textContent).toContain('此操作无法恢复'))
    const confirmations = Array.from(mountPoint!.querySelectorAll<HTMLButtonElement>('button'))
      .filter((button) => button.textContent?.trim() === '彻底删除')
    confirmations[confirmations.length - 1]?.click()

    await vi.waitFor(() => {
      expect(mountPoint?.textContent).toContain('服务记录已删除，文件清理待处理。')
    })
  })
})
